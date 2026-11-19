import {
  ComplianceConfig,
  ComplianceStatus,
  DEFAULT_COMPLIANCE_CONFIG,
  RestLocationType,
  WorkloadIntensity,
  WorkloadScheduleBand,
} from '../config/complianceConfig';
import {
  BlockComplianceResult,
  CrewRosterRow,
  HourlyEnvMetric,
  ShiftBlockPlan,
} from '../types/occupational';
import { estimateExposureAdjustedWbgt } from './wbgtCalculator';

export interface ComplianceEvaluationOptions {
  dateIso?: string;
  forceMiddaySeason?: boolean;
}

const REST_LOCATION_RANK: Record<RestLocationType, number> = {
  none_needed: 0,
  shaded_shelter: 1,
  air_conditioned_rest: 2,
  indoor_cool_zone: 2,
};

/**
 * Determines whether a given date falls inside the UAE MOHRE Midday Break seasonal window
 * (15 June – 15 September inclusive), unless seasonal enforcement is explicitly toggled for planning.
 */
export function isMiddayBreakSeason(
  dateInput: string | Date = new Date(),
  config: ComplianceConfig = DEFAULT_COMPLIANCE_CONFIG,
  forceMiddaySeason: boolean = false
): boolean {
  if (forceMiddaySeason) return true;

  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (Number.isNaN(d.getTime())) return false;

  const month = d.getMonth() + 1;
  const day = d.getDate();
  const { seasonStartMonth, seasonStartDay, seasonEndMonth, seasonEndDay } = config.middayBreak;

  const mmdd = month * 100 + day;
  const startMmdd = seasonStartMonth * 100 + seasonStartDay;
  const endMmdd = seasonEndMonth * 100 + seasonEndDay;

  return mmdd >= startMmdd && mmdd <= endMmdd;
}

/**
 * Checks whether an hour block (representing [hourIndex:00, hourIndex+1:00)) overlaps
 * the configured Midday Break window (12:30 – 15:00).
 * Overlap hours: 12 (12:30-13:00), 13 (13:00-14:00), 14 (14:00-15:00).
 */
export function overlapsMiddayBreakWindow(
  hourIndex: number,
  config: ComplianceConfig = DEFAULT_COMPLIANCE_CONFIG
): boolean {
  const blockStartMin = hourIndex * 60;
  const blockEndMin = (hourIndex + 1) * 60;
  const banStartMin = config.middayBreak.startHour * 60 + config.middayBreak.startMinute;
  const banEndMin = config.middayBreak.endHour * 60 + config.middayBreak.endMinute;

  return blockStartMin < banEndMin && blockEndMin > banStartMin;
}

/**
 * Maximum allowable direct-sun outdoor work minutes in an hour that overlaps 12:30-15:00.
 * Hour 12:00-13:00 only allows 30 mins (12:00-12:30); Hours 13 and 14 allow 0 mins under open sun.
 */
export function maxSunWorkMinutesDuringHour(
  hourIndex: number,
  isSeasonActive: boolean,
  config: ComplianceConfig = DEFAULT_COMPLIANCE_CONFIG
): number {
  if (!isSeasonActive) return 60;
  const blockStartMin = hourIndex * 60;
  const blockEndMin = (hourIndex + 1) * 60;
  const banStartMin = config.middayBreak.startHour * 60 + config.middayBreak.startMinute;
  const banEndMin = config.middayBreak.endHour * 60 + config.middayBreak.endMinute;

  if (blockEndMin <= banStartMin || blockStartMin >= banEndMin) {
    return 60;
  }

  const overlapStart = Math.max(blockStartMin, banStartMin);
  const overlapEnd = Math.min(blockEndMin, banEndMin);
  const forbiddenMinutes = Math.max(0, overlapEnd - overlapStart);
  return Math.max(0, 60 - forbiddenMinutes);
}

/**
 * Resolves the deterministic work/rest band for a given workload and estimated WBGT.
 */
export function selectWorkloadBand(
  workload: WorkloadIntensity,
  wbgtEstimatedC: number,
  config: ComplianceConfig = DEFAULT_COMPLIANCE_CONFIG
): WorkloadScheduleBand {
  const bands = config.workloadBands[workload] || config.workloadBands.moderate;
  for (const band of bands) {
    if (wbgtEstimatedC <= band.maxWbgtC) {
      return band;
    }
  }
  return bands[bands.length - 1];
}

/**
 * Deterministically evaluates a single crew shift hour block for UAE compliance.
 * Produces 'Compliant' | 'At risk' | 'Violation' along with exact rule names and plain-language reasons.
 */
export function evaluateBlockCompliance(
  block: ShiftBlockPlan,
  config: ComplianceConfig = DEFAULT_COMPLIANCE_CONFIG,
  options: ComplianceEvaluationOptions = {}
): BlockComplianceResult {
  const seasonActive = isMiddayBreakSeason(
    options.dateIso || new Date(),
    config,
    Boolean(options.forceMiddaySeason)
  );
  const middayOverlap = overlapsMiddayBreakWindow(block.hourIndex, config);
  const band = selectWorkloadBand(block.workload, block.wbgtEstimatedC, config);

  const triggeredRules: string[] = [];
  const violationReasons: string[] = [];
  const atRiskReasons: string[] = [];

  // 1. UAE MOHRE Midday Break Rule check (12:30 PM – 3:00 PM, 15 Jun – 15 Sep)
  if (
    seasonActive &&
    middayOverlap &&
    config.middayBreak.prohibitedExposures.includes(block.exposure)
  ) {
    const allowedSunMins = maxSunWorkMinutesDuringHour(block.hourIndex, seasonActive, config);
    if (block.workMinutes > allowedSunMins) {
      triggeredRules.push(config.middayBreak.ruleName);
      violationReasons.push(
        `${config.middayBreak.ruleName}: Direct sun outdoor work scheduled during 12:30–15:00 window (${block.workMinutes}m scheduled, max ${allowedSunMins}m outside ban).`
      );
    }
  }

  // 2. Estimated WBGT Workload Work/Rest Ceiling Check
  if (block.workMinutes > band.workMinutes) {
    triggeredRules.push('Estimated WBGT Workload & Work-Rest Schedule');
    violationReasons.push(
      `Estimated WBGT ${block.wbgtEstimatedC.toFixed(1)}°C for ${block.workload} workload permits max ${band.workMinutes}m work / ${band.restMinutes}m rest per hour (scheduled ${block.workMinutes}m work).`
    );
  } else if (
    block.workMinutes > 0 &&
    band.workMinutes < 60 &&
    block.wbgtEstimatedC >= band.maxWbgtC - config.atRiskBufferC
  ) {
    triggeredRules.push('Estimated WBGT Thermal Margin Warning');
    atRiskReasons.push(
      `Estimated WBGT ${block.wbgtEstimatedC.toFixed(1)}°C is within ${config.atRiskBufferC.toFixed(1)}°C of the next stricter rest tier for ${block.workload} work.`
    );
  } else if (block.workMinutes > 0 && block.wbgtEstimatedC >= 29.5 && block.exposure === 'sun') {
    triggeredRules.push('Direct Sun Heat Exposure Advisory');
    atRiskReasons.push(
      `Direct sun exposure at estimated WBGT ${block.wbgtEstimatedC.toFixed(1)}°C requires close rest/hydration adherence.`
    );
  }

  // 3. Shaded Rest Area, Cooling & Drinking Water Provision Check
  const requiredRank = REST_LOCATION_RANK[band.recommendedRestLocation];
  const actualRank = REST_LOCATION_RANK[block.restLocation];
  if (block.restMinutes > 0 && actualRank < requiredRank) {
    triggeredRules.push(config.provisions.ruleName);
    violationReasons.push(
      `${config.provisions.ruleName}: Required cooling location is ${band.recommendedRestLocation.replace(/_/g, ' ')} at ${block.wbgtEstimatedC.toFixed(1)}°C estimated WBGT.`
    );
  }

  if (
    block.wbgtEstimatedC >= config.provisions.shadeRequiredWbgtC &&
    block.hydrationMlPerHour < band.hydrationMlPerHour
  ) {
    triggeredRules.push(config.provisions.ruleName);
    violationReasons.push(
      `${config.provisions.ruleName}: Drinking water target ${block.hydrationMlPerHour}ml/hr is below required ${band.hydrationMlPerHour}ml/hr.`
    );
  }

  // 4. Severe unmitigated heat warning even in shade
  if (block.wbgtEstimatedC >= 33.0 && block.workMinutes > 0 && block.exposure !== 'indoor') {
    if (!triggeredRules.includes('Estimated WBGT Workload & Work-Rest Schedule')) {
      triggeredRules.push('Extreme Estimated Heat Index Advisory');
    }
    atRiskReasons.push(
      `Extreme outdoor thermal load (estimated WBGT ${block.wbgtEstimatedC.toFixed(1)}°C); prioritize indoor/AC reallocation where feasible.`
    );
  }

  const uniqueRules = Array.from(new Set(triggeredRules));

  if (violationReasons.length > 0) {
    return {
      blockId: block.id,
      crew_id: block.crew_id,
      hourIndex: block.hourIndex,
      timeRange: block.timeRange,
      status: 'Violation',
      triggeredRules: uniqueRules,
      reason: violationReasons[0],
      recommendedFix: `Set to ${band.workMinutes}m work / ${band.restMinutes}m ${band.recommendedRestLocation.replace(/_/g, ' ')} and ${band.hydrationMlPerHour}ml/hr water.`,
    };
  }

  if (atRiskReasons.length > 0) {
    return {
      blockId: block.id,
      crew_id: block.crew_id,
      hourIndex: block.hourIndex,
      timeRange: block.timeRange,
      status: 'At risk',
      triggeredRules: uniqueRules,
      reason: atRiskReasons[0],
    };
  }

  return {
    blockId: block.id,
    crew_id: block.crew_id,
    hourIndex: block.hourIndex,
    timeRange: block.timeRange,
    status: 'Compliant',
    triggeredRules: [middayOverlap && seasonActive ? config.middayBreak.ruleName : 'Estimated WBGT Workload Ceiling'],
    reason:
      middayOverlap && seasonActive && block.workMinutes === 0
        ? `Compliant: Midday break outdoor stoppage enforced (12:30–15:00).`
        : `Compliant: ${block.workMinutes}m work / ${block.restMinutes}m rest within estimated WBGT limit.`,
  };
}

export interface ScheduleValidationSummary {
  valid: boolean;
  overallStatus: ComplianceStatus;
  checks: BlockComplianceResult[];
  violations: BlockComplianceResult[];
}

export function validateScheduleBlocks(
  blocks: ShiftBlockPlan[],
  config: ComplianceConfig = DEFAULT_COMPLIANCE_CONFIG,
  options: ComplianceEvaluationOptions = {}
): ScheduleValidationSummary {
  const checks = blocks.map((b) => evaluateBlockCompliance(b, config, options));
  const violations = checks.filter((c) => c.status === 'Violation');
  const hasAtRisk = checks.some((c) => c.status === 'At risk');

  const overallStatus: ComplianceStatus =
    violations.length > 0 ? 'Violation' : hasAtRisk ? 'At risk' : 'Compliant';

  return {
    valid: violations.length === 0,
    overallStatus,
    checks,
    violations,
  };
}

export function parseHourFromShiftTime(hhmm: string, fallbackHour: number): number {
  const match = String(hhmm || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallbackHour;
  const h = Math.max(0, Math.min(23, parseInt(match[1], 10)));
  const m = parseInt(match[2], 10);
  // If shift ends at e.g. 16:30, include hour 16; if 16:00, end boundary is 16
  return m > 0 ? h + 1 : h;
}

function formatHourRange(h: number): string {
  const start = `${String(h).padStart(2, '0')}:00`;
  const end = `${String((h + 1) % 24).padStart(2, '0')}:00`;
  return `${start}–${end}`;
}

/**
 * Deterministic rule-based schedule generator used both as guaranteed fallback
 * and whenever AI output fails validation against the compliance engine.
 */
export function generateDeterministicScheduleBlocks(
  roster: CrewRosterRow[],
  hourlyWeather: HourlyEnvMetric[],
  config: ComplianceConfig = DEFAULT_COMPLIANCE_CONFIG,
  options: ComplianceEvaluationOptions = {}
): ShiftBlockPlan[] {
  const seasonActive = isMiddayBreakSeason(
    options.dateIso || new Date(),
    config,
    Boolean(options.forceMiddaySeason)
  );
  const byHour = new Map<number, HourlyEnvMetric>();
  for (const h of hourlyWeather) {
    byHour.set(h.hourIndex, h);
  }

  const blocks: ShiftBlockPlan[] = [];

  for (const crew of roster) {
    const startMatch = crew.shiftStart.match(/^(\d{1,2}):(\d{2})$/);
    const startH = startMatch ? Math.max(0, Math.min(23, parseInt(startMatch[1], 10))) : 6;
    const endH = Math.max(startH + 1, Math.min(24, parseHourFromShiftTime(crew.shiftEnd, 18)));

    for (let hour = startH; hour < endH; hour++) {
      const baseHour = byHour.get(hour) || hourlyWeather[0];
      const adjusted = estimateExposureAdjustedWbgt(baseHour, crew.exposure);
      const middayOverlap = overlapsMiddayBreakWindow(hour, config);
      const band = selectWorkloadBand(crew.workload, adjusted.wbgtEstimatedC, config);

      let workMinutes = band.workMinutes;
      let restMinutes = band.restMinutes;
      let restLocation: RestLocationType = band.recommendedRestLocation;
      let hydrationMlPerHour = band.hydrationMlPerHour;
      let taskNote = crew.taskType;
      let suggestedTaskReordering: string | undefined;

      if (
        seasonActive &&
        middayOverlap &&
        config.middayBreak.prohibitedExposures.includes(crew.exposure)
      ) {
        const maxSun = maxSunWorkMinutesDuringHour(hour, seasonActive, config);
        if (maxSun === 0) {
          workMinutes = 0;
          restMinutes = 60;
          restLocation = 'air_conditioned_rest';
          hydrationMlPerHour = Math.max(hydrationMlPerHour, 750);
          taskNote = `Mandatory Midday Break rest (${crew.taskType} paused)`;
          suggestedTaskReordering = `Reschedule ${crew.taskType} before 10:00 or after 15:30`;
        } else if (workMinutes > maxSun) {
          workMinutes = maxSun;
          restMinutes = 60 - maxSun;
          restLocation = 'shaded_shelter';
          taskNote = `Stop outdoor sun work at 12:30 for Midday Break`;
        }
      } else if (crew.workload === 'heavy' && adjusted.wbgtEstimatedC >= 29.5 && hour >= 10 && hour <= 15) {
        suggestedTaskReordering = `Move heavy ${crew.taskType} into early shift (06:00–09:00)`;
      }

      blocks.push({
        id: `${crew.crew_id}-${hour}`,
        crew_id: crew.crew_id,
        hourIndex: hour,
        timeRange: formatHourRange(hour),
        taskType: crew.taskType,
        workload: crew.workload,
        exposure: crew.exposure,
        workMinutes,
        restMinutes,
        restLocation,
        hydrationMlPerHour,
        taskNote,
        suggestedTaskReordering,
        isMiddayBreakWindow: middayOverlap,
        wbgtEstimatedC: adjusted.wbgtEstimatedC,
        heatIndexEstimatedC: adjusted.heatIndexEstimatedC,
        riskLevel: adjusted.riskLevel,
      });
    }
  }

  return blocks;
}

/**
 * Computes hourly rest-area occupancy across active crews, factoring site rest-area capacity
 * and first-aider availability (never exceeds capacity outside mandatory midday stop without warning).
 */
export function computeRestAreaOccupancy(
  blocks: ShiftBlockPlan[],
  capacityCrews: number = 2,
  firstAidersOnDuty: number = 2,
  hours: number[] = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
): import('../types/occupational').RestAreaHourlyOccupancy[] {
  const safeCap = Math.max(1, capacityCrews);
  const safeAiders = Math.max(0, firstAidersOnDuty);

  return hours.map((h) => {
    const restingBlocks = blocks.filter((b) => b.hourIndex === h && b.restMinutes > 0);
    const crewsResting = restingBlocks.length;
    const isFullStop = h === 13 || h === 14;
    // During mandatory 13:00-15:00 midday stop all sun crews rest indoors/AC; outside midday, staggered breaks prevent crowding
    const effectiveCap = isFullStop ? Math.max(safeCap, crewsResting) : safeCap;
    return {
      hourIndex: h,
      hourLabel: `${String(h).padStart(2, '0')}:00`,
      crewsResting,
      capacityCrews: effectiveCap,
      overCapacity: crewsResting > effectiveCap,
      firstAiderAvailable: safeAiders >= 1,
    };
  });
}

/**
 * Deterministically flags dangerous working conditions across hourly crew blocks & site zones
 * (e.g. heavy work + exposed sun/rooftop + peak/midday WBGT, or non-acclimatized crews in high heat).
 */
export function detectDangerousConditions(
  blocks: ShiftBlockPlan[],
  roster: CrewRosterRow[],
  zoneAssignments?: Record<string, import('../types/occupational').CrewZoneAssignment>
): import('../types/occupational').DangerousConditionAlert[] {
  const alerts: import('../types/occupational').DangerousConditionAlert[] = [];
  const rosterByCrew = new Map(roster.map((r) => [r.crew_id, r]));
  const seen = new Set<string>();

  for (const b of blocks) {
    if (b.workMinutes === 0) continue;
    const crew = rosterByCrew.get(b.crew_id);
    const zone = zoneAssignments?.[b.crew_id]?.zoneType || 'open_ground';

    if (b.workload === 'heavy' && b.exposure === 'sun' && b.wbgtEstimatedC >= 30.0) {
      const key = `${b.crew_id}-heavy-sun-${b.hourIndex}`;
      if (!seen.has(key)) {
        seen.add(key);
        alerts.push({
          id: key,
          crew_id: b.crew_id,
          timeRange: b.timeRange,
          severity: b.wbgtEstimatedC >= 32.0 ? 'Critical' : 'High',
          summary: `Heavy direct-sun work (${zone.replace(/_/g, ' ')}) at ${b.wbgtEstimatedC.toFixed(1)}°C est. WBGT.`,
          recommendation: `Shift heavy tasks to 06:00–09:00 or enforce 30m+ shaded recovery & chilled electrolytes.`,
        });
      }
    }

    if (
      (crew?.crewTag === 'new_to_site' || crew?.crewTag === 'returning_after_leave') &&
      b.wbgtEstimatedC >= 29.0 &&
      b.workMinutes >= 45
    ) {
      const key = `${b.crew_id}-acclim-${b.hourIndex}`;
      if (!seen.has(key)) {
        seen.add(key);
        alerts.push({
          id: key,
          crew_id: b.crew_id,
          timeRange: b.timeRange,
          severity: 'High',
          summary: `${crew.crewTag.replace(/_/g, ' ')} crew assigned ${b.workMinutes}m continuous work at ${b.wbgtEstimatedC.toFixed(1)}°C WBGT.`,
          recommendation: `Apply gradual acclimatization ramp: cap bout <=30m/hr and assign shaded tasks.`,
        });
      }
    }
  }

  return alerts.slice(0, 8);
}
