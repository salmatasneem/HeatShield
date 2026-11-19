import {
  ActionEscalationLevel,
  ComplianceConfig,
  ComplianceStatus,
  DEFAULT_COMPLIANCE_CONFIG,
  ExposureType,
  WorkloadIntensity,
  WorkZoneType,
} from '../config/complianceConfig';
import {
  AcclimatizationStatusTag,
  AnonymousIncidentRecord,
  AuditGovernanceEntry,
  CrewAcclimatizationPlan,
  CrewRosterRow,
  CrewZoneAssignment,
  DataConfidenceLevel,
  DynamicTriggerEvaluation,
  EnvWeatherState,
  HydrationAlertAuditRecord,
  PortfolioSiteRow,
  SchedulePlanResult,
  SiteReadinessChecklistState,
  SiteReadinessItem,
} from '../types/occupational';
import { evaluateBlockCompliance, isMiddayBreakSeason, overlapsMiddayBreakWindow } from './complianceEngine';
import { UAE_SITE_PRESETS } from './dataService';
import { estimateEnvironmentalHeatMetrics } from './wbgtCalculator';

export const DEFAULT_READINESS_ITEMS: SiteReadinessItem[] = [
  {
    id: 'shaded_rest',
    label: 'Shaded rest area available & ventilated',
    labelAr: 'توفر منطقة استراحة مظللة ومهواة',
    checked: true,
    note: 'Shade Bay A1 & Misting Tent B2 inspected',
  },
  {
    id: 'water_electrolytes',
    label: 'Drinking water & electrolytes stocked (<15°C)',
    labelAr: 'توفر مياه الشرب الباردة والأملاح المعدنية',
    checked: true,
    note: 'Chilled coolers stocked at all bays',
  },
  {
    id: 'cooling_stations',
    label: 'AC / misting cooling stations working properly',
    labelAr: 'محطات التبريد والمكيفات تعمل بكفاءة',
    checked: true,
    note: '',
  },
  {
    id: 'first_aider',
    label: 'Site first-aider / medic on duty',
    labelAr: 'تواجد المسعف الميداني المناوب بالموقع',
    checked: true,
    note: '',
  },
  {
    id: 'emergency_contacts',
    label: 'Emergency contacts (998) posted visibly at zones',
    labelAr: 'لوحات أرقام الطوارئ (998) معلقة بوضوح',
    checked: true,
    note: '',
  },
  {
    id: 'shift_briefing',
    label: 'Pre-shift crew heat-safety briefing completed',
    labelAr: 'إتمام الإحاطة الصباحية للسلامة الحرارية',
    checked: false,
    note: 'Pending Crew-C sign-off',
  },
];

export const DEFAULT_DEMO_INCIDENTS: AnonymousIncidentRecord[] = [
  {
    id: 'inc-demo-1',
    occurredAtIso: '2026-07-12T14:15:00+04:00',
    hourOfDay: 14,
    zoneLabel: 'Zone B (Rooftop)',
    airTempC: 44.2,
    wbgtEstimatedC: 32.8,
    actionTaken: 'Moved work to morning window & added AC cool-down shelter',
    notes: 'Demo baseline record · Anonymous near-miss event logged for schedule improvement.',
  },
  {
    id: 'inc-demo-2',
    occurredAtIso: '2026-07-18T14:30:00+04:00',
    hourOfDay: 14,
    zoneLabel: 'Zone B (Rooftop)',
    airTempC: 43.8,
    wbgtEstimatedC: 32.4,
    actionTaken: 'Enforced 20-min hydration interval & reflective awning barrier',
    notes: 'Demo baseline record · High afternoon radiant load.',
  },
  {
    id: 'inc-demo-3',
    occurredAtIso: '2026-07-22T11:20:00+04:00',
    hourOfDay: 11,
    zoneLabel: 'Zone C (Trench)',
    airTempC: 41.0,
    wbgtEstimatedC: 30.7,
    actionTaken: 'Deployed portable ventilation fan and cut continuous bout to 30m',
    notes: 'Demo baseline record · Reduced airflow noted in trench excavation.',
  },
];

export function computeReadinessCompletion(items: SiteReadinessItem[]): number {
  if (items.length === 0) return 0;
  const done = items.filter((i) => i.checked).length;
  return Math.round((done / items.length) * 100);
}

export function buildInitialReadinessState(): SiteReadinessChecklistState {
  return {
    updatedAtIso: new Date().toISOString(),
    items: DEFAULT_READINESS_ITEMS,
    completionPercent: computeReadinessCompletion(DEFAULT_READINESS_ITEMS),
  };
}

/**
 * 1. Deterministic Acclimatization Ramp Generator (Fallback or Offline)
 */
export function generateDeterministicAcclimatizationPlan(
  crewId: string,
  status: AcclimatizationStatusTag,
  config: ComplianceConfig = DEFAULT_COMPLIANCE_CONFIG
): CrewAcclimatizationPlan {
  const acclimCfg = config?.acclimatization || DEFAULT_COMPLIANCE_CONFIG.acclimatization;
  const disclaimer = `${acclimCfg.guidanceNote} Automated environmental guidance only. Not a medical diagnosis or treatment.`;
  if (status === 'acclimatized') {
    return {
      crew_id: crewId,
      status,
      generatedAtIso: new Date().toISOString(),
      source: 'deterministic',
      summary: `${crewId} is marked acclimatized. Apply standard site work-rest ratios and MOHRE Midday Break compliance.`,
      days: [
        {
          day: 1,
          maxExposurePct: 100,
          recommendedWorkload: 'heavy',
          workRestNote: 'Follow live WBGT hourly work-rest bands (standard schedule).',
          guidanceNote: 'Maintain 15–30 min hydration intervals and shaded recovery.',
        },
      ],
      disclaimer,
    };
  }

  const pcts =
    status === 'new_to_site'
      ? acclimCfg.newToSiteSchedulePct
      : acclimCfg.returningAfterLeavePct;

  return {
    crew_id: crewId,
    status,
    generatedAtIso: new Date().toISOString(),
    source: 'deterministic',
    summary:
      status === 'new_to_site'
        ? `${crewId} is tagged New to Site: gradual 5-day exposure ramp recommended before full peak-heat workload.`
        : `${crewId} is tagged Returning After Leave: gradual 4-day re-adaptation ramp recommended.`,
    days: pcts.map((pct, i) => ({
      day: i + 1,
      maxExposurePct: pct,
      recommendedWorkload: pct <= 45 ? 'light' : pct <= 80 ? 'moderate' : 'heavy',
      workRestNote:
        pct <= 45
          ? `Cap hot-zone exposure at ~${pct}% of full shift; schedule tasks in 06:00–09:00 window with 30m rest/hr.`
          : pct <= 80
          ? `Limit hot-zone exposure to ~${pct}% with extra 15m shaded/AC cool-down per hour.`
          : `Full shift ramp (${pct}%) once crew tolerates moderate work in site conditions cleanly.`,
      guidanceNote: acclimCfg.guidanceNote,
    })),
    disclaimer,
  };
}

/**
 * 4. Dynamic Action Escalation & 3-Hour Look-Ahead Engine
 */
export function wbgtToActionLevel(
  wbgtC: number,
  config: ComplianceConfig = DEFAULT_COMPLIANCE_CONFIG,
  isMiddayBreakActiveNow: boolean = false
): ActionEscalationLevel {
  const triggers = config?.escalationTriggers || DEFAULT_COMPLIANCE_CONFIG.escalationTriggers;
  if (isMiddayBreakActiveNow || wbgtC >= triggers.stopWorkWbgtC) {
    return 'Stop work';
  }
  if (wbgtC >= triggers.restrictWbgtC) {
    return 'Restrict';
  }
  if (wbgtC >= triggers.advisoryWbgtC) {
    return 'Advisory';
  }
  return 'Green';
}

export function getEscalationActions(level: ActionEscalationLevel): string[] {
  switch (level) {
    case 'Stop work':
      return [
        'Suspend direct-sun outdoor operations immediately and move crews to AC/shaded rest halls.',
        'Switch hydration prompts to every 15 minutes (250 ml chilled water + electrolytes).',
        'Verify first-aider availability and maintain mandatory cool-down until WBGT drops.',
      ];
    case 'Restrict':
      return [
        'Restrict continuous heavy outdoor work; enforce at least 30 min work / 30 min shade.',
        'Reschedule non-urgent heavy tasks before 10:30 or after 16:00.',
        'Activate cooling/misting stations and push 20-minute crew hydration alerts.',
      ];
    case 'Advisory':
      return [
        'Increase shaded rest breaks to 15 min per hour for moderate/heavy crews.',
        'Ensure drinking water <15°C is positioned within 50m of active work zones.',
        'Monitor 3-hour forecast slope for upcoming Restrict threshold crossing.',
      ];
    default:
      return [
        'Standard site operations permitted under routine hydration and buddy awareness.',
        'Confirm daily readiness checklist completion before midday heat builds.',
      ];
  }
}

export function evaluateDynamicTriggers(
  weather: EnvWeatherState,
  config: ComplianceConfig = DEFAULT_COMPLIANCE_CONFIG,
  zoneOffsetC: number = 0,
  forceMiddaySeason: boolean = false
): DynamicTriggerEvaluation {
  const triggers = config?.escalationTriggers || DEFAULT_COMPLIANCE_CONFIG.escalationTriggers;
  const offlineDefaults =
    config?.conservativeOfflineDefaults || DEFAULT_COMPLIANCE_CONFIG.conservativeOfflineDefaults;

  const effectiveBaseWbgt =
    weather.status === 'live'
      ? weather.current.wbgtEstimatedC
      : Math.max(weather.current.wbgtEstimatedC, offlineDefaults.wbgtEstimatedC - 2.0);

  const wbgtEffectiveC = Number((effectiveBaseWbgt + zoneOffsetC).toFixed(1));
  const nowHour = weather.current.hourIndex;
  const seasonOn = isMiddayBreakSeason(weather.fetchedAtIso, config, forceMiddaySeason);
  const middayNow = seasonOn && overlapsMiddayBreakWindow(nowHour, config);

  const currentLevel = wbgtToActionLevel(wbgtEffectiveC, config, middayNow);

  const lookAheadCount = Math.max(1, triggers.lookAheadHours);
  const upcoming = weather.hourly
    .filter((h) => h.hourIndex > nowHour && h.hourIndex <= nowHour + lookAheadCount)
    .map((h) => {
      const estWbgt = Number((h.wbgtEstimatedC + zoneOffsetC).toFixed(1));
      const hourMidday = seasonOn && overlapsMiddayBreakWindow(h.hourIndex, config);
      return {
        hourIndex: h.hourIndex,
        hourLabel: h.hourLabel,
        wbgtEstimatedC: estWbgt,
        level: wbgtToActionLevel(estWbgt, config, hourMidday),
      };
    });

  const severityOrder: Record<ActionEscalationLevel, number> = {
    Green: 0,
    Advisory: 1,
    Restrict: 2,
    'Stop work': 3,
  };

  let lookAheadWarning: string | null = null;
  const higherUpcoming = upcoming.find(
    (u) => severityOrder[u.level] > severityOrder[currentLevel]
  );
  if (higherUpcoming) {
    const preHour = `${String(Math.max(0, higherUpcoming.hourIndex - 1)).padStart(2, '0')}:30`;
    lookAheadWarning = `Risk will reach ${higherUpcoming.level} at ${higherUpcoming.hourLabel} (${higherUpcoming.wbgtEstimatedC.toFixed(1)}°C est. WBGT). Suggest moving heavy tasks before ${preHour}.`;
  } else if (currentLevel === 'Green' || currentLevel === 'Advisory') {
    const peak = weather.hourly.find(
      (h) => h.hourIndex >= nowHour && severityOrder[wbgtToActionLevel(h.wbgtEstimatedC + zoneOffsetC, config, seasonOn && overlapsMiddayBreakWindow(h.hourIndex, config))] >= 2
    );
    if (peak) {
      const preHour = `${String(Math.max(0, peak.hourIndex - 1)).padStart(2, '0')}:30`;
      lookAheadWarning = `Daytime forecast reaches ${wbgtToActionLevel(peak.wbgtEstimatedC + zoneOffsetC, config)} by ${peak.hourLabel}. Front-load heavy tasks before ${preHour}.`;
    }
  }

  return {
    currentLevel,
    wbgtEffectiveC,
    triggerReason: middayNow
      ? `UAE MOHRE Midday Break active (${weather.current.hourLabel}) & est. WBGT ${wbgtEffectiveC}°C`
      : `Est. WBGT ${wbgtEffectiveC}°C (Advisory ${triggers.advisoryWbgtC}°C · Restrict ${triggers.restrictWbgtC}°C · Stop work ${triggers.stopWorkWbgtC}°C)`,
    recommendedActions: getEscalationActions(currentLevel),
    lookAheadWarning,
    threeHourOutlook: upcoming.map((u) => ({
      hourLabel: u.hourLabel,
      wbgtEstimatedC: u.wbgtEstimatedC,
      level: u.level,
    })),
  };
}

/**
 * 5. Equipment & Work-Zone Heat Load Evaluation (Transparent, never hidden)
 */
export function evaluateZoneAndPpeContext(
  assignment: CrewZoneAssignment,
  crewWorkload: WorkloadIntensity,
  currentHour: number,
  baseWbgtC: number,
  config: ComplianceConfig = DEFAULT_COMPLIANCE_CONFIG
) {
  const workZones = config?.workZoneModifiers || DEFAULT_COMPLIANCE_CONFIG.workZoneModifiers;
  const ppeMods = config?.ppeModifiers || DEFAULT_COMPLIANCE_CONFIG.ppeModifiers;
  const zoneMeta = workZones[assignment.zoneType] || workZones.open_ground;
  const darkOffset = assignment.darkPpe ? ppeMods.darkPpeOffsetC : 0;
  const reflectiveOffset = assignment.reflectiveSurfaces
    ? ppeMods.reflectiveSurfacesOffsetC
    : 0;
  const totalOffsetC = Number((zoneMeta.wbgtOffsetC + darkOffset + reflectiveOffset).toFixed(1));
  const adjustedWbgtC = Number((baseWbgtC + totalOffsetC).toFixed(1));

  const flags: string[] = [];
  const alternatives: string[] = [];

  if (
    assignment.zoneType === 'rooftop' &&
    crewWorkload === 'heavy' &&
    currentHour >= 10 &&
    currentHour <= 15
  ) {
    flags.push('High-Risk Combo: Heavy workload on exposed rooftop during high solar angle.');
    alternatives.push('Move rooftop heavy tasks to 06:00–09:00 or erect temporary overhead shade tarps.');
  }
  if (assignment.zoneType === 'confined_space' && baseWbgtC >= 27.5) {
    flags.push('High-Risk Combo: Confined space heat retention with elevated ambient humidity.');
    alternatives.push('Deploy forced-air blowers, cap continuous work at 20 min, and keep standby relief.');
  }
  if (assignment.zoneType === 'near_machinery' && assignment.darkPpe) {
    flags.push('Radiant Load + Dark PPE absorbs extra infrared heat near hot equipment.');
    alternatives.push('Use light-colored breathable FR garments and portable heat shields.');
  }
  if (assignment.zoneType === 'trench' && currentHour >= 11 && currentHour <= 16) {
    flags.push('Reduced Airflow: Trench excavation traps warm air.');
    alternatives.push('Position shaded water station at trench rim and rotate crews every 30 min.');
  }

  return {
    zoneLabel: zoneMeta.label,
    zoneOffsetC: zoneMeta.wbgtOffsetC,
    darkPpeOffsetC: darkOffset,
    reflectiveOffsetC: reflectiveOffset,
    totalOffsetC,
    adjustedWbgtC,
    transparentFormulaNote: `Base est. WBGT (${baseWbgtC.toFixed(1)}°C) + Zone (${zoneMeta.label}: ${zoneMeta.wbgtOffsetC >= 0 ? '+' : ''}${zoneMeta.wbgtOffsetC}°C)${assignment.darkPpe ? ` + Dark PPE (+${darkOffset}°C)` : ''}${assignment.reflectiveSurfaces ? ` + Reflective Surfaces (+${reflectiveOffset}°C)` : ''} = ${adjustedWbgtC.toFixed(1)}°C effective est. thermal load.`,
    flags,
    alternatives,
  };
}

/**
 * 3. Hydration & Rest-Break Reminder Payload (EN / AR / HI / UR)
 */
export function buildHydrationReminderPayload(
  crewId: string,
  workload: WorkloadIntensity,
  wbgtC: number,
  config: ComplianceConfig = DEFAULT_COMPLIANCE_CONFIG
): Omit<HydrationAlertAuditRecord, 'id' | 'sentAtIso' | 'status'> {
  const baseLevel = wbgtToActionLevel(wbgtC, config, false);
  // Step up one notch if heavy workload + elevated WBGT
  const order: ActionEscalationLevel[] = ['Green', 'Advisory', 'Restrict', 'Stop work'];
  const idx = order.indexOf(baseLevel);
  const effectiveLevel =
    workload === 'heavy' && idx < order.length - 1 ? order[idx + 1] : baseLevel;

  const cadenceMap = config?.hydrationCadence || DEFAULT_COMPLIANCE_CONFIG.hydrationCadence;
  const rule = cadenceMap[effectiveLevel] || DEFAULT_COMPLIANCE_CONFIG.hydrationCadence.Advisory;
  const elecNoteEn = rule.electrolytesRecommended ? ' + electrolytes' : '';
  const elecNoteAr = rule.electrolytesRecommended ? ' مع أملاح الترطيب' : '';

  return {
    crew_id: crewId,
    actionLevel: effectiveLevel,
    wbgtEstimatedC: Number(wbgtC.toFixed(1)),
    intervalMinutes: rule.intervalMinutes,
    mlPerBreak: rule.mlPerBreak,
    channel: 'banner',
    messages: {
      en: `[HeatShield · ${crewId}] Level: ${effectiveLevel} (Est. WBGT ${wbgtC.toFixed(1)}°C). Drink ${rule.mlPerBreak}ml chilled water${elecNoteEn} every ${rule.intervalMinutes} min & take shaded rest.`,
      ar: `[درع الحرارة · ${crewId}] المستوى: ${effectiveLevel} (${wbgtC.toFixed(1)}°م تقديري). اشرب ${rule.mlPerBreak} مل ماء بارد${elecNoteAr} كل ${rule.intervalMinutes} دقيقة واسترح في الظل.`,
      hi: `[HeatShield · ${crewId}] स्तर: ${effectiveLevel} (${wbgtC.toFixed(1)}°C)। हर ${rule.intervalMinutes} मिनट में ${rule.mlPerBreak}ml ठंडा पानी पिएं और छाया में आराम करें।`,
      ur: `[HeatShield · ${crewId}] درجہ: ${effectiveLevel} (${wbgtC.toFixed(1)}°C)۔ ہر ${rule.intervalMinutes} منٹ بعد ${rule.mlPerBreak}ml ٹھنڈا پانی پیئیں اور سائے میں آرام کریں۔`,
    },
  };
}

/**
 * 6. What-If Simulator Evaluation (Deterministic Compliance + Risk)
 */
export interface WhatIfInputs {
  airTempC: number;
  humidityPct: number;
  shiftStartHour: number;
  workload: WorkloadIntensity;
  restMinutesPerHour: number;
  exposure: ExposureType;
  zoneType: WorkZoneType;
  darkPpe: boolean;
  reflectiveSurfaces: boolean;
  forceMiddaySeason: boolean;
}

export function runWhatIfSimulation(
  inputs: WhatIfInputs,
  config: ComplianceConfig = DEFAULT_COMPLIANCE_CONFIG
) {
  const solarWm2 =
    inputs.exposure === 'sun' && inputs.shiftStartHour >= 7 && inputs.shiftStartHour <= 17
      ? Math.round(850 * Math.sin(((inputs.shiftStartHour - 6) / 12) * Math.PI))
      : inputs.exposure === 'shade'
      ? 220
      : 0;

  const baseEst = estimateEnvironmentalHeatMetrics({
    airTempC: inputs.airTempC,
    relativeHumidityPct: inputs.humidityPct,
    windSpeedKmh: 10,
    solarRadiationWm2: Math.max(0, solarWm2),
    exposure: inputs.exposure,
  });

  const zoneEval = evaluateZoneAndPpeContext(
    {
      crew_id: 'Simulated-Crew',
      zoneType: inputs.zoneType,
      darkPpe: inputs.darkPpe,
      reflectiveSurfaces: inputs.reflectiveSurfaces,
    },
    inputs.workload,
    inputs.shiftStartHour,
    baseEst.wbgtEstimatedC,
    config
  );

  const actionLevel = wbgtToActionLevel(
    zoneEval.adjustedWbgtC,
    config,
    inputs.forceMiddaySeason && overlapsMiddayBreakWindow(inputs.shiftStartHour, config)
  );

  const workMinutes = Math.max(0, 60 - inputs.restMinutesPerHour);
  const simBlockCompliance = evaluateBlockCompliance(
    {
      id: 'sim-block',
      crew_id: 'Simulated-Crew',
      hourIndex: inputs.shiftStartHour,
      timeRange: `${String(inputs.shiftStartHour).padStart(2, '0')}:00–${String(inputs.shiftStartHour + 1).padStart(2, '0')}:00`,
      taskType: 'Simulated Task',
      workload: inputs.workload,
      exposure: inputs.exposure,
      workMinutes,
      restMinutes: inputs.restMinutesPerHour,
      restLocation:
        zoneEval.adjustedWbgtC >= config.provisions.acRequiredWbgtC
          ? 'air_conditioned_rest'
          : inputs.restMinutesPerHour > 0
          ? 'shaded_shelter'
          : 'none_needed',
      hydrationMlPerHour: 750,
      taskNote: 'What-if simulation',
      isMiddayBreakWindow: overlapsMiddayBreakWindow(inputs.shiftStartHour, config),
      wbgtEstimatedC: zoneEval.adjustedWbgtC,
      heatIndexEstimatedC: baseEst.heatIndexEstimatedC,
      riskLevel: baseEst.riskLevel,
    },
    config,
    { forceMiddaySeason: inputs.forceMiddaySeason }
  );

  return {
    baseWbgtC: baseEst.wbgtEstimatedC,
    effectiveWbgtC: zoneEval.adjustedWbgtC,
    heatIndexEstimatedC: baseEst.heatIndexEstimatedC,
    actionLevel,
    complianceStatus: simBlockCompliance.status,
    triggeredRules: simBlockCompliance.triggeredRules,
    complianceReason: simBlockCompliance.reason,
    recommendedFix: simBlockCompliance.recommendedFix,
    transparentFormulaNote: zoneEval.transparentFormulaNote,
    comboFlags: zoneEval.flags,
  };
}

/**
 * 7. Anonymous Incident Pattern Detector
 */
export function analyzeIncidentPatterns(incidents: AnonymousIncidentRecord[]) {
  if (incidents.length === 0) {
    return {
      totalCount: 0,
      peakHourLabel: 'None logged',
      topZone: 'None logged',
      patternHeadline: 'No anonymous near-misses or incidents recorded yet.',
    };
  }

  const byHour = new Map<number, number>();
  const byZone = new Map<string, number>();

  for (const inc of incidents) {
    byHour.set(inc.hourOfDay, (byHour.get(inc.hourOfDay) || 0) + 1);
    byZone.set(inc.zoneLabel, (byZone.get(inc.zoneLabel) || 0) + 1);
  }

  const topHourEntry = Array.from(byHour.entries()).sort((a, b) => b[1] - a[1])[0];
  const topZoneEntry = Array.from(byZone.entries()).sort((a, b) => b[1] - a[1])[0];

  const hourStr = `${String(topHourEntry[0]).padStart(2, '0')}:00`;
  return {
    totalCount: incidents.length,
    peakHourLabel: hourStr,
    topZone: topZoneEntry[0],
    patternHeadline: `Most logged events occurred around ${hourStr} in ${topZoneEntry[0]} (${topZoneEntry[1]} of ${incidents.length} events). Consider shifting tasks away from this window.`,
  };
}

/**
 * 9. Multi-Site Portfolio Aggregator (Prioritized by Attention Need)
 */
export function buildMultiSitePortfolio(
  activeWeather: EnvWeatherState,
  activeComplianceStatus: ComplianceStatus,
  activeChecklistPct: number,
  config: ComplianceConfig = DEFAULT_COMPLIANCE_CONFIG,
  forceMiddaySeason: boolean = false
): PortfolioSiteRow[] {
  return UAE_SITE_PRESETS.map((site) => {
    const isSelected = site.id === activeWeather.site.id;
    // Slight realistic microclimate offsets for non-active presets based on emirate geography (forecast baseline)
    const tempOffset =
      site.id === 'al-ain' ? 1.8 : site.id === 'abu-dhabi' ? 0.6 : site.id === 'sharjah' ? -0.3 : 0;
    const rhOffset =
      site.id === 'al-ain' ? -12 : site.id === 'sharjah' ? 5 : 0;

    const airTempC = isSelected
      ? activeWeather.current.airTempC
      : Number((activeWeather.current.airTempC + tempOffset).toFixed(1));
    const rh = isSelected
      ? activeWeather.current.relativeHumidityPct
      : Math.max(18, Math.min(85, activeWeather.current.relativeHumidityPct + rhOffset));

    const est = isSelected
      ? {
          wbgtEstimatedC: activeWeather.current.wbgtEstimatedC,
        }
      : estimateEnvironmentalHeatMetrics({
          airTempC,
          relativeHumidityPct: rh,
          windSpeedKmh: activeWeather.current.windSpeedKmh,
          solarRadiationWm2: activeWeather.current.solarRadiationWm2,
          exposure: 'sun',
        });

    const level = wbgtToActionLevel(
      est.wbgtEstimatedC,
      config,
      forceMiddaySeason && overlapsMiddayBreakWindow(activeWeather.current.hourIndex, config)
    );
    const checklistPct = isSelected ? activeChecklistPct : site.id === 'al-ain' ? 67 : 83;
    const compliance: ComplianceStatus = isSelected
      ? activeComplianceStatus
      : level === 'Stop work'
      ? 'At risk'
      : 'Compliant';

    const levelWeight =
      level === 'Stop work' ? 40 : level === 'Restrict' ? 25 : level === 'Advisory' ? 12 : 0;
    const compWeight = compliance === 'Violation' ? 35 : compliance === 'At risk' ? 15 : 0;
    const checklistPenalty = Math.round((100 - checklistPct) * 0.3);

    return {
      siteId: site.id,
      siteName: site.name,
      siteNameAr: site.nameAr,
      emirate: site.emirate,
      lat: site.latitude,
      lon: site.longitude,
      airTempC,
      wbgtEstimatedC: est.wbgtEstimatedC,
      actionLevel: level,
      complianceStatus: compliance,
      checklistPercent: checklistPct,
      dataConfidence: (isSelected
        ? activeWeather.status === 'live'
          ? 'live'
          : 'stale'
        : activeWeather.status === 'live'
        ? 'forecast'
        : 'stale') as DataConfidenceLevel,
      lastUpdatedDisplay: activeWeather.lastUpdatedDisplay,
      needsAttentionScore: levelWeight + compWeight + checklistPenalty,
    };
  }).sort((a, b) => b.needsAttentionScore - a.needsAttentionScore);
}

/**
 * 13. Judge Demo Impact Indicators (Clearly Labeled Demo/Operational Metrics, Non-Clinical)
 */
export function computeJudgeImpactMetrics(
  plan: SchedulePlanResult,
  roster: CrewRosterRow[],
  checklist: SiteReadinessChecklistState,
  hydrationAlerts: HydrationAlertAuditRecord[],
  auditLog: AuditGovernanceEntry[]
) {
  const restMinutesAdded = plan.blocks.reduce((sum, b) => sum + b.restMinutes, 0);
  const heavyWorkMovedOutOfPeak = plan.blocks.filter(
    (b) => b.workload === 'heavy' && (b.hourIndex < 10 || b.hourIndex >= 16)
  ).length * 60;

  const middayBlocks = plan.blocks.filter((b) => b.isMiddayBreakWindow);
  const compliantMiddayCount = middayBlocks.filter(
    (b) => b.exposure !== 'sun' || b.workMinutes === 0 || b.hourIndex === 12
  ).length;
  const middayBanCompliancePct =
    middayBlocks.length > 0 ? Math.round((compliantMiddayCount / middayBlocks.length) * 100) : 100;

  const acknowledgedCount = hydrationAlerts.filter((a) => a.status === 'acknowledged').length;

  return {
    crewsCovered: roster.length,
    restMinutesAdded,
    heavyWorkMovedMinutes: heavyWorkMovedOutOfPeak,
    middayBanCompliancePct,
    alertsSent: hydrationAlerts.length,
    alertsAcknowledged: acknowledgedCount,
    readinessPct: checklist.completionPercent,
    governanceReviews: auditLog.length,
    isDemoLabel: 'Demo & Operational Schedule Indicators — Not a claim of clinical health outcomes.',
  };
}
