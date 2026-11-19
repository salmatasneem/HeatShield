import {
  ComplianceConfig,
  DEFAULT_COMPLIANCE_CONFIG,
  ExposureType,
  RestLocationType,
} from '../config/complianceConfig';
import {
  CrewRosterRow,
  EnvWeatherState,
  ScheduleDiffItem,
  SchedulePlanResult,
  ShiftBlockPlan,
} from '../types/occupational';
import {
  ComplianceEvaluationOptions,
  computeRestAreaOccupancy,
  detectDangerousConditions,
  generateDeterministicScheduleBlocks,
  overlapsMiddayBreakWindow,
  validateScheduleBlocks,
} from './complianceEngine';
import { estimateExposureAdjustedWbgt } from './wbgtCalculator';

export interface PlanScheduleParams {
  weather: EnvWeatherState;
  roster: CrewRosterRow[];
  config?: ComplianceConfig;
  complianceOptions?: ComplianceEvaluationOptions;
  previousPlan?: SchedulePlanResult | null;
  forceMockAiViolation?: boolean;
  siteRestCapacityCrews?: number;
  firstAidersOnDuty?: number;
  zoneAssignments?: Record<string, import('../types/occupational').CrewZoneAssignment>;
}

function normalizeRestLocation(raw: string): RestLocationType {
  const v = String(raw || '').toLowerCase();
  if (v.includes('air') || v.includes('ac')) return 'air_conditioned_rest';
  if (v.includes('indoor') || v.includes('cool_zone')) return 'indoor_cool_zone';
  if (v.includes('shade') || v.includes('canopy') || v.includes('tent')) return 'shaded_shelter';
  return 'none_needed';
}

function normalizeExposure(raw: string, fallback: ExposureType): ExposureType {
  const v = String(raw || '').toLowerCase();
  if (v === 'indoor') return 'indoor';
  if (v === 'shade') return 'shade';
  if (v === 'sun') return 'sun';
  return fallback;
}

export function computeScheduleDiff(
  prevBlocks: ShiftBlockPlan[],
  nextBlocks: ShiftBlockPlan[]
): ScheduleDiffItem[] {
  if (!prevBlocks.length) return [];
  const prevMap = new Map<string, ShiftBlockPlan>();
  for (const b of prevBlocks) {
    prevMap.set(`${b.crew_id}:${b.hourIndex}`, b);
  }

  const diffs: ScheduleDiffItem[] = [];
  for (const next of nextBlocks) {
    const prev = prevMap.get(`${next.crew_id}:${next.hourIndex}`);
    if (!prev) {
      diffs.push({
        crew_id: next.crew_id,
        timeRange: next.timeRange,
        field: 'workRest',
        before: 'Not scheduled',
        after: `${next.workMinutes}m work / ${next.restMinutes}m rest`,
      });
      continue;
    }

    const prevWR = `${prev.workMinutes}m/${prev.restMinutes}m`;
    const nextWR = `${next.workMinutes}m/${next.restMinutes}m`;
    if (prevWR !== nextWR) {
      diffs.push({
        crew_id: next.crew_id,
        timeRange: next.timeRange,
        field: 'workRest',
        before: prevWR,
        after: nextWR,
      });
    }

    if (prev.exposure !== next.exposure) {
      diffs.push({
        crew_id: next.crew_id,
        timeRange: next.timeRange,
        field: 'exposure',
        before: prev.exposure,
        after: next.exposure,
      });
    }

    if (prev.restLocation !== next.restLocation) {
      diffs.push({
        crew_id: next.crew_id,
        timeRange: next.timeRange,
        field: 'restLocation',
        before: prev.restLocation.replace(/_/g, ' '),
        after: next.restLocation.replace(/_/g, ' '),
      });
    }

    if (prev.hydrationMlPerHour !== next.hydrationMlPerHour) {
      diffs.push({
        crew_id: next.crew_id,
        timeRange: next.timeRange,
        field: 'hydration',
        before: `${prev.hydrationMlPerHour}ml/hr`,
        after: `${next.hydrationMlPerHour}ml/hr`,
      });
    }
  }

  return diffs.slice(0, 16);
}

function buildDeterministicExplanation(
  weather: EnvWeatherState,
  roster: CrewRosterRow[]
): { riskDriversExplanation: string; whyThisSchedule: string; topSuggestions: string[] } {
  const peakHour = [...weather.hourly].sort((a, b) => b.wbgtEstimatedC - a.wbgtEstimatedC)[0] || weather.current;
  const heavyCrews = roster.filter((r) => r.workload === 'heavy' && r.exposure === 'sun').map((r) => r.crew_id);

  return {
    riskDriversExplanation: `Top heat drivers at ${weather.site.name} are afternoon ambient temperature peaking at ${peakHour.airTempC.toFixed(1)}°C (around ${peakHour.hourLabel}), ${peakHour.relativeHumidityPct}% humidity, and ${peakHour.solarRadiationWm2} W/m² solar irradiance producing an estimated WBGT of ${peakHour.wbgtEstimatedC.toFixed(1)}°C (Heat Index est. ${peakHour.heatIndexEstimatedC.toFixed(1)}°C).`,
    whyThisSchedule: `Deterministic rule-based schedule pauses direct-sun outdoor shifts between 12:30 and 15:00 under the UAE MOHRE Midday Break Rule and enforces progressive 15–45 minute rest cycles, shaded/AC cooling zones, and 500–1,000 ml/hr hydration targets.`,
    topSuggestions: [
      heavyCrews.length > 0
        ? `Schedule heavy direct-sun work for ${heavyCrews.join(', ')} into the 06:00–09:00 morning window before estimated WBGT exceeds 29.5°C.`
        : 'Prioritize outdoor structural rigging before 10:00 AM and reserve shaded tasks for mid-morning.',
      'Stage chilled drinking water and shaded shelter bays within 100 m of active crews before 09:30 AM.',
      'Shift non-urgent outdoor sun crews to indoor or shaded pre-fabrication between 12:30 and 15:00.',
    ],
  };
}

/**
 * Calls server-side Gemini schedule planner with STRICTLY anonymized crew-level data,
 * hourly environmental readings, and UAE compliance rules.
 * Automatically rejects and falls back to the deterministic schedule if Gemini output
 * violates any rule in complianceEngine.
 */
export async function planCompliantSchedule(params: PlanScheduleParams): Promise<SchedulePlanResult> {
  const config = params.config || DEFAULT_COMPLIANCE_CONFIG;
  const evalOptions = params.complianceOptions || { forceMiddaySeason: true };

  // Strip strictly to anonymized fields ONLY (defense-in-depth data minimization)
  const sanitizedRoster: CrewRosterRow[] = params.roster.map((r) => ({
    crew_id: r.crew_id,
    taskType: r.taskType,
    workload: r.workload,
    exposure: r.exposure,
    shiftStart: r.shiftStart,
    shiftEnd: r.shiftEnd,
    ...(r.crewTag ? { crewTag: r.crewTag } : {}),
  }));
  const siteRestCapacityCrews = Math.max(1, params.siteRestCapacityCrews ?? 2);
  const firstAidersOnDuty = Math.max(1, params.firstAidersOnDuty ?? 2);

  const hourlySummary = params.weather.hourly
    .filter((h) => h.hourIndex >= 5 && h.hourIndex <= 20)
    .map((h) => ({
      hourIndex: h.hourIndex,
      hourLabel: h.hourLabel,
      airTempC: h.airTempC,
      relativeHumidityPct: h.relativeHumidityPct,
      windSpeedKmh: h.windSpeedKmh,
      solarRadiationWm2: h.solarRadiationWm2,
      wbgtEstimatedC: h.wbgtEstimatedC,
      heatIndexEstimatedC: h.heatIndexEstimatedC,
      riskLevel: h.riskLevel,
    }));

  const deterministicBlocks = generateDeterministicScheduleBlocks(
    sanitizedRoster,
    params.weather.hourly,
    config,
    evalOptions
  );

  let aiAttempted = false;
  let aiRejected = false;
  const aiRejectionReasons: string[] = [];
  let chosenBlocks: ShiftBlockPlan[] = deterministicBlocks;
  let source: 'gemini' | 'deterministic_fallback' = 'deterministic_fallback';

  const fallbackText = buildDeterministicExplanation(params.weather, sanitizedRoster);
  let riskDriversExplanation = fallbackText.riskDriversExplanation;
  let whyThisSchedule = fallbackText.whyThisSchedule;
  let topTaskReorderingSuggestions = fallbackText.topSuggestions;

  try {
    aiAttempted = true;

    // Optional intentional violation test mode for demonstrating deterministic rejection guardrail
    if (params.forceMockAiViolation) {
      const badBlocks: ShiftBlockPlan[] = deterministicBlocks.map((b) =>
        b.hourIndex === 13 && b.exposure === 'sun'
          ? {
              ...b,
              workMinutes: 45,
              restMinutes: 15,
              taskNote: '[Simulated AI Draft] Continue exterior steel erection through 13:00',
            }
          : b
      );
      const validation = validateScheduleBlocks(badBlocks, config, evalOptions);
      if (!validation.valid) {
        aiRejected = true;
        validation.violations.forEach((v) => {
          aiRejectionReasons.push(`${v.crew_id} (${v.timeRange}): ${v.reason}`);
        });
      }
    } else {
      const response = await fetch('/api/gemini/schedule-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteName: params.weather.site.name,
          hourlyWeather: hourlySummary,
          roster: sanitizedRoster,
          siteRestCapacityCrews,
          firstAidersOnDuty,
          complianceRules: {
            middayBreakWindow: '12:30-15:00 (June 15 - September 15)',
            middayProhibitedExposure: 'sun',
            workloadBands: config.workloadBands,
            verificationNote: config.verificationNotice,
          },
        }),
        signal: AbortSignal.timeout(12000),
      });

      if (response.ok) {
        const aiJson = await response.json();
        if (aiJson.riskDriversExplanation) {
          riskDriversExplanation = String(aiJson.riskDriversExplanation);
        }
        if (aiJson.whyThisSchedule) {
          whyThisSchedule = String(aiJson.whyThisSchedule);
        }
        if (Array.isArray(aiJson.suggestedTaskReordering) && aiJson.suggestedTaskReordering.length > 0) {
          topTaskReorderingSuggestions = aiJson.suggestedTaskReordering.map((s: any) => String(s));
        }

        if (aiJson.source === 'gemini' && Array.isArray(aiJson.crewBlocks) && aiJson.crewBlocks.length > 0) {
          // Map AI crewBlocks onto our deterministic hour grid, preserving exact environmental calculations
          const aiLookup = new Map<string, any>();
          for (const item of aiJson.crewBlocks) {
            const key = `${String(item.crew_id)}:${Number(item.hourIndex)}`;
            aiLookup.set(key, item);
          }

          const candidateBlocks: ShiftBlockPlan[] = deterministicBlocks.map((base) => {
            const match = aiLookup.get(`${base.crew_id}:${base.hourIndex}`);
            if (!match) return base;

            const workMinutes = Math.max(0, Math.min(60, Math.round(Number(match.workMinutes ?? base.workMinutes))));
            const restMinutes = Math.max(0, Math.min(60, 60 - workMinutes));
            const exposure = normalizeExposure(match.exposure, base.exposure);
            const hourMetric = params.weather.hourly.find((h) => h.hourIndex === base.hourIndex) || params.weather.current;
            const adjusted = estimateExposureAdjustedWbgt(hourMetric, exposure);

            return {
              ...base,
              exposure,
              workMinutes,
              restMinutes,
              restLocation: normalizeRestLocation(match.restLocation),
              hydrationMlPerHour: Math.max(
                250,
                Math.min(1500, Math.round(Number(match.hydrationMlPerHour ?? base.hydrationMlPerHour)))
              ),
              taskNote: match.taskNote ? String(match.taskNote).slice(0, 120) : base.taskNote,
              suggestedTaskReordering: match.suggestedTaskReordering
                ? String(match.suggestedTaskReordering).slice(0, 120)
                : base.suggestedTaskReordering,
              isMiddayBreakWindow: overlapsMiddayBreakWindow(base.hourIndex, config),
              wbgtEstimatedC: adjusted.wbgtEstimatedC,
              heatIndexEstimatedC: adjusted.heatIndexEstimatedC,
              riskLevel: adjusted.riskLevel,
            };
          });

          const aiValidation = validateScheduleBlocks(candidateBlocks, config, evalOptions);
          if (aiValidation.valid) {
            chosenBlocks = candidateBlocks;
            source = 'gemini';
          } else {
            aiRejected = true;
            aiValidation.violations.forEach((v) => {
              aiRejectionReasons.push(`${v.crew_id} (${v.timeRange}): ${v.reason}`);
            });
            // Auto-fall back to guaranteed compliant deterministic schedule
            chosenBlocks = deterministicBlocks;
            source = 'deterministic_fallback';
          }
        }
      }
    }
  } catch (err: any) {
    aiRejected = false;
    source = 'deterministic_fallback';
    if (err?.message) {
      aiRejectionReasons.push(`AI planner unavailable (${err.message}); used deterministic compliant schedule.`);
    }
  }

  const finalValidation = validateScheduleBlocks(chosenBlocks, config, evalOptions);
  const diffFromPrevious = params.previousPlan
    ? computeScheduleDiff(params.previousPlan.blocks, chosenBlocks)
    : [];
  const restOccupancy = computeRestAreaOccupancy(
    chosenBlocks,
    siteRestCapacityCrews,
    firstAidersOnDuty
  );
  const dangerousConditions = detectDangerousConditions(
    chosenBlocks,
    sanitizedRoster,
    params.zoneAssignments
  );

  return {
    planId: `plan-${Date.now()}`,
    generatedAtIso: new Date().toISOString(),
    source,
    aiAttempted,
    aiRejected,
    aiRejectionReasons,
    validatedByComplianceEngine: true,
    overallComplianceStatus: finalValidation.overallStatus,
    complianceChecks: finalValidation.checks,
    riskDriversExplanation,
    whyThisSchedule,
    topTaskReorderingSuggestions,
    blocks: chosenBlocks,
    approved: false,
    diffFromPrevious,
    restOccupancy,
    dangerousConditions,
  };
}
