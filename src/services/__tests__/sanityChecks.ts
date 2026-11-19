import assert from 'node:assert/strict';
import { DEFAULT_COMPLIANCE_CONFIG } from '../../config/complianceConfig';
import { estimateEnvironmentalHeatMetrics } from '../wbgtCalculator';
import {
  computeRestAreaOccupancy,
  detectDangerousConditions,
  evaluateBlockCompliance,
  generateDeterministicScheduleBlocks,
  isMiddayBreakSeason,
  validateScheduleBlocks,
} from '../complianceEngine';
import { appendAuditEntry, createAuditEntry, summarizeAuditDecisions } from '../auditLog';
import { parseRosterCsv, DEMO_ROSTER_ROWS } from '../rosterParser';
import { buildStationCheckInUrl, parseCheckInQueryParams } from '../shadeRegistryService';
import {
  analyzeIncidentPatterns,
  buildHydrationReminderPayload,
  buildMultiSitePortfolio,
  computeReadinessCompletion,
  DEFAULT_DEMO_INCIDENTS,
  DEFAULT_READINESS_ITEMS,
  evaluateDynamicTriggers,
  evaluateZoneAndPpeContext,
  generateDeterministicAcclimatizationPlan,
  runWhatIfSimulation,
} from '../coordinatorEngines';
import { EnvWeatherState, HourlyEnvMetric, ShiftBlockPlan } from '../../types/occupational';
import { applySiteMeterOverride, UAE_SITE_PRESETS } from '../dataService';

function runSanityChecks() {
  console.log('Running HeatShield AI deterministic sanity checks...');

  // 1. wbgtCalculator sanity checks
  const coolMorning = estimateEnvironmentalHeatMetrics({
    airTempC: 28,
    relativeHumidityPct: 45,
    windSpeedKmh: 14,
    solarRadiationWm2: 200,
    exposure: 'sun',
  });
  const hotAfternoonSun = estimateEnvironmentalHeatMetrics({
    airTempC: 44,
    relativeHumidityPct: 48,
    windSpeedKmh: 8,
    solarRadiationWm2: 900,
    exposure: 'sun',
  });
  const hotAfternoonShade = estimateEnvironmentalHeatMetrics({
    airTempC: 44,
    relativeHumidityPct: 48,
    windSpeedKmh: 8,
    solarRadiationWm2: 900,
    exposure: 'shade',
  });
  const hotAfternoonIndoor = estimateEnvironmentalHeatMetrics({
    airTempC: 30,
    relativeHumidityPct: 48,
    windSpeedKmh: 12,
    solarRadiationWm2: 0,
    exposure: 'indoor',
  });

  assert.equal(coolMorning.isEstimated, true, 'Metrics must be flagged as estimated');
  assert.ok(
    hotAfternoonSun.wbgtEstimatedC > coolMorning.wbgtEstimatedC,
    'Hot afternoon sun WBGT must exceed cool morning WBGT'
  );
  assert.ok(
    hotAfternoonSun.wbgtEstimatedC > hotAfternoonShade.wbgtEstimatedC,
    'Direct sun WBGT must exceed shaded WBGT under high solar radiation'
  );
  assert.ok(
    hotAfternoonSun.heatIndexEstimatedC > 45,
    'Heat Index at 44C and 48% RH should exceed 45C'
  );
  assert.equal(hotAfternoonIndoor.riskLevel, 'Low', '30C indoor controlled should be Low risk');

  // 2. UAE Midday Break seasonal date window (15 June - 15 September)
  assert.equal(
    isMiddayBreakSeason('2026-06-15T13:00:00Z', DEFAULT_COMPLIANCE_CONFIG, false),
    true,
    'June 15 must be inside Midday Break season'
  );
  assert.equal(
    isMiddayBreakSeason('2026-09-15T13:00:00Z', DEFAULT_COMPLIANCE_CONFIG, false),
    true,
    'September 15 must be inside Midday Break season'
  );
  assert.equal(
    isMiddayBreakSeason('2026-11-10T13:00:00Z', DEFAULT_COMPLIANCE_CONFIG, false),
    false,
    'November 10 is outside Midday Break season unless forced'
  );

  // 3. Deterministic violation on open-sun work during 13:00-14:00 inside Midday Break
  const illegalMiddayBlock: ShiftBlockPlan = {
    id: 'Crew-A-13',
    crew_id: 'Crew-A',
    hourIndex: 13,
    timeRange: '13:00–14:00',
    taskType: 'Steel Fixing',
    workload: 'heavy',
    exposure: 'sun',
    workMinutes: 30,
    restMinutes: 30,
    restLocation: 'shaded_shelter',
    hydrationMlPerHour: 1000,
    taskNote: 'Steel work',
    isMiddayBreakWindow: true,
    wbgtEstimatedC: 33.5,
    heatIndexEstimatedC: 51.0,
    riskLevel: 'Critical',
  };

  const violationResult = evaluateBlockCompliance(illegalMiddayBlock, DEFAULT_COMPLIANCE_CONFIG, {
    dateIso: '2026-07-15T13:00:00Z',
  });
  assert.equal(violationResult.status, 'Violation', 'Open sun work at 13:00 in July must be Violation');
  assert.ok(
    violationResult.triggeredRules.includes('UAE MOHRE Midday Break Rule'),
    'Must cite UAE MOHRE Midday Break Rule by name'
  );

  // 4. Indoor work during 13:00-14:00 is allowed under Midday Break rule when WBGT/work ratio complies
  const legalIndoorBlock: ShiftBlockPlan = {
    id: 'Crew-D-13',
    crew_id: 'Crew-D',
    hourIndex: 13,
    timeRange: '13:00–14:00',
    taskType: 'Indoor Fit-out',
    workload: 'light',
    exposure: 'indoor',
    workMinutes: 60,
    restMinutes: 0,
    restLocation: 'none_needed',
    hydrationMlPerHour: 500,
    taskNote: 'Indoor work',
    isMiddayBreakWindow: true,
    wbgtEstimatedC: 26.2,
    heatIndexEstimatedC: 29.0,
    riskLevel: 'Low',
  };
  const indoorResult = evaluateBlockCompliance(legalIndoorBlock, DEFAULT_COMPLIANCE_CONFIG, {
    dateIso: '2026-07-15T13:00:00Z',
  });
  assert.equal(indoorResult.status, 'Compliant', 'Controlled indoor light work at 13:00 must be Compliant');

  // 5. Deterministic generator produces 0 violations across full summer shift
  const syntheticDay: HourlyEnvMetric[] = Array.from({ length: 24 }, (_, hourIndex) => {
    const airTempC = 30 + Math.max(0, Math.sin(((hourIndex - 6) / 12) * Math.PI)) * 13;
    const relativeHumidityPct = 46;
    const windSpeedKmh = 11;
    const solarRadiationWm2 = hourIndex >= 6 && hourIndex <= 18 ? 820 : 0;
    const est = estimateEnvironmentalHeatMetrics({
      airTempC,
      relativeHumidityPct,
      windSpeedKmh,
      solarRadiationWm2,
      exposure: 'sun',
    });
    return {
      timeIso: `2026-07-15T${String(hourIndex).padStart(2, '0')}:00`,
      hourIndex,
      hourLabel: `${String(hourIndex).padStart(2, '0')}:00`,
      airTempC: Number(airTempC.toFixed(1)),
      relativeHumidityPct,
      windSpeedKmh,
      solarRadiationWm2,
      uvIndex: 9,
      ...est,
    };
  });

  const generatedBlocks = generateDeterministicScheduleBlocks(
    DEMO_ROSTER_ROWS,
    syntheticDay,
    DEFAULT_COMPLIANCE_CONFIG,
    { forceMiddaySeason: true }
  );
  const fullValidation = validateScheduleBlocks(generatedBlocks, DEFAULT_COMPLIANCE_CONFIG, {
    forceMiddaySeason: true,
  });
  assert.equal(fullValidation.valid, true, 'Deterministic schedule fallback must always have 0 violations');

  // 6. Data minimization sanity check: rosterParser strips worker_name, age, medical_history
  const parsed = parseRosterCsv(
    'crew_id,worker_name,age,medical_history,taskType,workload,exposure,shiftStart,shiftEnd\nCrew-X,Ali Hassan,39,Hypertension,Concrete Pour,heavy,sun,06:00,16:00'
  );
  assert.equal(parsed.rows.length, 1);
  assert.deepEqual(Object.keys(parsed.rows[0]).sort(), [
    'crew_id',
    'exposure',
    'shiftEnd',
    'shiftStart',
    'taskType',
    'workload',
  ]);
  assert.ok(parsed.strippedPersonalColumns.includes('worker_name'));
  assert.ok(parsed.strippedPersonalColumns.includes('medical_history'));

  // 7. Rest Station QR URL generator & parser sanity check (zero PII)
  const qrUrl = buildStationCheckInUrl(
    {
      stationId: 'SHADE-B2',
      stationName: 'Shade Bay B2 · Misting Tent',
      siteId: 'abu-dhabi',
      siteName: 'Abu Dhabi Musaffah',
      coolingType: 'misting_tent',
      defaultCrewId: 'Crew-B',
    },
    'https://heatshield.example.com'
  );
  const queryStart = qrUrl.indexOf('?');
  const parsedQr = parseCheckInQueryParams(qrUrl.slice(queryStart));
  assert.ok(parsedQr && parsedQr.isCheckIn, 'QR URL must parse as instant check-in');
  assert.equal(parsedQr?.stationId, 'SHADE-B2');
  assert.equal(parsedQr?.siteId, 'abu-dhabi');
  assert.equal(parsedQr?.crewId, 'Crew-B');
  assert.equal(parsedQr?.coolingType, 'misting_tent');

  // 8. Equipment & Work-Zone transparent heat load & high-risk combo check
  const zoneEval = evaluateZoneAndPpeContext(
    { crew_id: 'Crew-B', zoneType: 'rooftop', darkPpe: true, reflectiveSurfaces: true },
    'heavy',
    13,
    30.0,
    DEFAULT_COMPLIANCE_CONFIG
  );
  assert.ok(zoneEval.adjustedWbgtC > 30.0, 'Rooftop + dark PPE + reflective must transparently add offset');
  assert.ok(zoneEval.flags.length >= 1, 'Heavy rooftop midday must flag high-risk combo');
  assert.ok(
    zoneEval.transparentFormulaNote.includes('Dark PPE'),
    'Dark PPE factor must be transparent in explanation'
  );

  // 9. Dynamic Trigger & 3-hour Look-Ahead check
  const morningWeather: EnvWeatherState = {
    site: UAE_SITE_PRESETS[0],
    status: 'live',
    fetchedAtIso: '2026-07-15T08:00:00Z',
    lastUpdatedDisplay: '08:00 AM',
    sourceLabel: 'Open-Meteo Test',
    current: syntheticDay[8],
    hourly: syntheticDay,
  };
  const triggerRes = evaluateDynamicTriggers(morningWeather, DEFAULT_COMPLIANCE_CONFIG, 0, true);
  assert.equal(triggerRes.threeHourOutlook.length, 3, 'Must produce 3-hour look-ahead');
  assert.ok(triggerRes.lookAheadWarning !== null, 'Morning ramp should forecast upcoming escalation');

  // 10. What-If Simulator deterministic check
  const simViolation = runWhatIfSimulation(
    {
      airTempC: 44,
      humidityPct: 50,
      shiftStartHour: 13,
      workload: 'heavy',
      restMinutesPerHour: 0,
      exposure: 'sun',
      zoneType: 'rooftop',
      darkPpe: true,
      reflectiveSurfaces: false,
      forceMiddaySeason: true,
    },
    DEFAULT_COMPLIANCE_CONFIG
  );
  assert.equal(simViolation.complianceStatus, 'Violation', 'Open sun 13:00 summer sim must flag Violation');
  assert.equal(simViolation.actionLevel, 'Stop work');

  // 11. Acclimatization ramp & checklist completion checks
  const acclimPlan = generateDeterministicAcclimatizationPlan(
    'Crew-C',
    'new_to_site',
    DEFAULT_COMPLIANCE_CONFIG
  );
  assert.equal(acclimPlan.days.length, 5, 'New-to-site ramp must provide multi-day progression');
  assert.ok(acclimPlan.disclaimer.includes('HSE officer'), 'Must advise verifying with HSE officer');
  assert.equal(computeReadinessCompletion(DEFAULT_READINESS_ITEMS), 83);

  // 12. Multilingual hydration payload & incident pattern detector checks
  const hydPayload = buildHydrationReminderPayload('Crew-A', 'heavy', 31.2, DEFAULT_COMPLIANCE_CONFIG);
  assert.ok(hydPayload.messages.ar.length > 0 && hydPayload.messages.hi.length > 0 && hydPayload.messages.ur.length > 0);
  const pattern = analyzeIncidentPatterns(DEFAULT_DEMO_INCIDENTS);
  assert.equal(pattern.peakHourLabel, '14:00');
  assert.equal(pattern.topZone, 'Zone B (Rooftop)');

  // 13. Multi-site portfolio sorting check
  const portfolio = buildMultiSitePortfolio(morningWeather, 'Compliant', 83, DEFAULT_COMPLIANCE_CONFIG, true);
  assert.equal(portfolio.length, UAE_SITE_PRESETS.length);
  assert.ok(portfolio[0].needsAttentionScore >= portfolio[portfolio.length - 1].needsAttentionScore);

  // 14. Legacy partial ComplianceConfig regression check (missing workZoneModifiers/ppeModifiers)
  const legacyPartialConfig = { middayBreak: DEFAULT_COMPLIANCE_CONFIG.middayBreak } as any;
  const legacyZoneRes = evaluateZoneAndPpeContext(
    { crew_id: 'Crew-A', zoneType: 'open_ground', darkPpe: false, reflectiveSurfaces: false },
    'moderate',
    10,
    29.0,
    legacyPartialConfig
  );
  assert.equal(legacyZoneRes.adjustedWbgtC, 29.0);

  // 15. auditLog create/append/summarize check (AI Suggestion -> Compliance Verdict -> Human Decision)
  const entryA = createAuditEntry({
    idPrefix: 'test',
    planId: 'plan-1',
    aiSuggestionSummary: 'Shifted Crew-A heavy pour to 06:00.',
    complianceVerdict: 'Compliant',
    humanDecision: 'Approved',
    details: 'Approved by site coordinator.',
  });
  const entryB = createAuditEntry({
    idPrefix: 'test',
    planId: 'plan-2',
    aiSuggestionSummary: 'AI draft included 13:00 sun block.',
    complianceVerdict: 'Violation',
    humanDecision: 'Rejected / Replaced',
    details: 'Replaced by compliant deterministic fallback.',
  });
  const log = appendAuditEntry([entryA], entryB);
  const summary = summarizeAuditDecisions(log);
  assert.equal(summary.total, 2);
  assert.equal(summary.approved, 1);
  assert.equal(summary.rejected, 1);

  // 16. Rest-area occupancy & dangerous condition deterministic checks
  const occupancy = computeRestAreaOccupancy(generatedBlocks, 1, 0, [10, 11, 13]);
  assert.equal(occupancy.length, 3);
  assert.equal(occupancy[0].firstAiderAvailable, false, '0 first-aiders must flag No FA');

  const dangerousBlocks: ShiftBlockPlan[] = [
    {
      id: 'Crew-C-11',
      crew_id: 'Crew-C',
      hourIndex: 11,
      timeRange: '11:00–12:00',
      taskType: 'Concrete Casting',
      workload: 'heavy',
      exposure: 'sun',
      workMinutes: 45,
      restMinutes: 15,
      restLocation: 'shaded_shelter',
      hydrationMlPerHour: 1000,
      taskNote: 'Direct sun heavy task',
      isMiddayBreakWindow: false,
      wbgtEstimatedC: 31.4,
      heatIndexEstimatedC: 46.5,
      riskLevel: 'High',
    },
  ];
  const dangers = detectDangerousConditions(dangerousBlocks, DEMO_ROSTER_ROWS);
  assert.ok(dangers.length >= 1, 'Heavy open-sun work above 30C WBGT must trigger dangerous condition alert');

  // 17. On-site meter override (Regional forecast -> Site-measured) & crewTag CSV support
  const measuredWeather = applySiteMeterOverride(morningWeather, {
    airTempC: 45.2,
    relativeHumidityPct: 55,
    manualWbgtC: 33.4,
  });
  assert.equal(measuredWeather.measurementMode, 'site_measured');
  assert.equal(measuredWeather.current.wbgtEstimatedC, 33.4);

  const taggedParsed = parseRosterCsv(
    'crew_id,taskType,workload,exposure,shiftStart,shiftEnd,crewTag\nCrew-Z,Formwork,heavy,sun,06:00,16:00,new_to_site'
  );
  assert.equal(taggedParsed.rows[0].crewTag, 'new_to_site');

  console.log('All 17 HeatShield AI sanity check suites passed.');
}

runSanityChecks();
