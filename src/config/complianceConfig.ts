export type WorkloadIntensity = 'light' | 'moderate' | 'heavy';
export type ExposureType = 'sun' | 'shade' | 'indoor';
export type RestLocationType = 'none_needed' | 'shaded_shelter' | 'air_conditioned_rest' | 'indoor_cool_zone';
export type ComplianceStatus = 'Compliant' | 'At risk' | 'Violation';
export type ActionEscalationLevel = 'Green' | 'Advisory' | 'Restrict' | 'Stop work';
export type WorkZoneType =
  | 'open_ground'
  | 'rooftop'
  | 'trench'
  | 'confined_space'
  | 'near_machinery'
  | 'indoor_shaded';
export type CrewAcclimatizationStatus =
  | 'new_to_site'
  | 'returning_after_leave'
  | 'acclimatized';

export interface MiddayBreakRuleConfig {
  ruleName: string;
  seasonStartMonth: number; // 1-12 (June = 6)
  seasonStartDay: number;   // 15
  seasonEndMonth: number;   // 1-12 (September = 9)
  seasonEndDay: number;     // 15
  startHour: number;        // 12
  startMinute: number;      // 30 -> 12:30 PM
  endHour: number;          // 15
  endMinute: number;        // 00 -> 3:00 PM
  prohibitedExposures: ExposureType[];
  requiredRestLocation: RestLocationType;
}

export interface WorkloadScheduleBand {
  maxWbgtC: number;
  workMinutes: number;
  restMinutes: number;
  recommendedRestLocation: RestLocationType;
  hydrationMlPerHour: number;
}

export interface WorkZoneContextConfig {
  label: string;
  labelAr: string;
  wbgtOffsetC: number;
  notes: string;
}

export interface AcclimatizationGuidanceConfig {
  guidanceNote: string;
  newToSiteSchedulePct: number[];       // e.g., [20, 40, 60, 80, 100]
  returningAfterLeavePct: number[];     // e.g., [50, 75, 90, 100]
}

export interface HydrationCadenceRule {
  level: ActionEscalationLevel;
  intervalMinutes: number;
  mlPerBreak: number;
  electrolytesRecommended: boolean;
}

export interface ComplianceConfig {
  verificationNotice: string;
  middayBreak: MiddayBreakRuleConfig;
  atRiskBufferC: number;
  provisions: {
    ruleName: string;
    shadeRequiredWbgtC: number;
    acRequiredWbgtC: number;
    minHydrationMlPerHourModerate: number;
    minHydrationMlPerHourHigh: number;
  };
  escalationTriggers: {
    ruleName: string;
    advisoryWbgtC: number;
    restrictWbgtC: number;
    stopWorkWbgtC: number;
    lookAheadHours: number;
  };
  workZoneModifiers: Record<WorkZoneType, WorkZoneContextConfig>;
  ppeModifiers: {
    darkPpeOffsetC: number;
    reflectiveSurfacesOffsetC: number;
    note: string;
  };
  acclimatization: AcclimatizationGuidanceConfig;
  hydrationCadence: Record<ActionEscalationLevel, HydrationCadenceRule>;
  conservativeOfflineDefaults: {
    airTempC: number;
    relativeHumidityPct: number;
    wbgtEstimatedC: number;
    heatIndexEstimatedC: number;
    note: string;
  };
  workloadBands: Record<WorkloadIntensity, WorkloadScheduleBand[]>;
}

/**
 * Editable UAE Occupational Heat Compliance Configuration.
 * Verify against the latest official MOHRE / OSHAD guidance before operational use.
 * Note: Rules are referenced by name only; verify official circulars for site-specific exemptions.
 */
export const DEFAULT_COMPLIANCE_CONFIG: ComplianceConfig = {
  verificationNotice:
    'Verify against the latest official MOHRE / OSHAD guidance before operational use.',
  middayBreak: {
    ruleName: 'UAE MOHRE Midday Break Rule',
    seasonStartMonth: 6,
    seasonStartDay: 15,
    seasonEndMonth: 9,
    seasonEndDay: 15,
    startHour: 12,
    startMinute: 30,
    endHour: 15,
    endMinute: 0,
    prohibitedExposures: ['sun'],
    requiredRestLocation: 'shaded_shelter',
  },
  atRiskBufferC: 1.0,
  provisions: {
    ruleName: 'UAE Heat Provisions: Shaded Rest, Drinking Water & Cooling',
    shadeRequiredWbgtC: 27.5,
    acRequiredWbgtC: 31.5,
    minHydrationMlPerHourModerate: 500,
    minHydrationMlPerHourHigh: 750,
  },
  escalationTriggers: {
    ruleName: 'Site Action Escalation Triggers',
    advisoryWbgtC: 27.5,
    restrictWbgtC: 29.5,
    stopWorkWbgtC: 32.0,
    lookAheadHours: 3,
  },
  workZoneModifiers: {
    open_ground: {
      label: 'Open Ground / Slab',
      labelAr: 'ساحة عمل مكشوفة',
      wbgtOffsetC: 0.0,
      notes: 'Baseline outdoor microclimate.',
    },
    rooftop: {
      label: 'Rooftop / Exposed Slab',
      labelAr: 'السطح العلوي المكشوف',
      wbgtOffsetC: 1.5,
      notes: 'High direct solar radiation & low wind obstruction (+1.5°C estimated WBGT load).',
    },
    trench: {
      label: 'Trench / Deep Excavation',
      labelAr: 'خندق أو حفر عميق',
      wbgtOffsetC: 0.9,
      notes: 'Reduced airflow & stagnant air pockets (+0.9°C estimated WBGT load).',
    },
    confined_space: {
      label: 'Confined Space / Chamber',
      labelAr: 'مكان مغلق / ضيق التهوية',
      wbgtOffsetC: 1.8,
      notes: 'Restricted ventilation & moisture build-up (+1.8°C estimated WBGT load).',
    },
    near_machinery: {
      label: 'Near Hot Machinery / Generators',
      labelAr: 'بالقرب من المعدات والآلات الحارة',
      wbgtOffsetC: 1.2,
      notes: 'Radiant heat from heavy engines/welding (+1.2°C estimated WBGT load).',
    },
    indoor_shaded: {
      label: 'Indoor / Mechanically Shaded Bay',
      labelAr: 'منطقة داخلية / مظللة ميكانيكياً',
      wbgtOffsetC: -2.5,
      notes: 'Shielded from direct solar radiation (-2.5°C estimated WBGT reduction).',
    },
  },
  ppeModifiers: {
    darkPpeOffsetC: 1.0,
    reflectiveSurfacesOffsetC: 0.8,
    note: 'Dark PPE and reflective surfaces are shown transparently in explanations as optional heat-load factors.',
  },
  acclimatization: {
    guidanceNote: 'General guidance, verify with your HSE officer.',
    newToSiteSchedulePct: [20, 40, 60, 80, 100],
    returningAfterLeavePct: [50, 75, 90, 100],
  },
  hydrationCadence: {
    Green: { level: 'Green', intervalMinutes: 45, mlPerBreak: 250, electrolytesRecommended: false },
    Advisory: { level: 'Advisory', intervalMinutes: 30, mlPerBreak: 250, electrolytesRecommended: false },
    Restrict: { level: 'Restrict', intervalMinutes: 20, mlPerBreak: 250, electrolytesRecommended: true },
    'Stop work': { level: 'Stop work', intervalMinutes: 15, mlPerBreak: 250, electrolytesRecommended: true },
  },
  conservativeOfflineDefaults: {
    airTempC: 41.5,
    relativeHumidityPct: 55,
    wbgtEstimatedC: 31.8,
    heatIndexEstimatedC: 48.0,
    note: 'Conservative summer safety defaults applied automatically whenever live weather is stale or offline.',
  },
  workloadBands: {
    light: [
      { maxWbgtC: 29.5, workMinutes: 60, restMinutes: 0, recommendedRestLocation: 'none_needed', hydrationMlPerHour: 500 },
      { maxWbgtC: 31.0, workMinutes: 45, restMinutes: 15, recommendedRestLocation: 'shaded_shelter', hydrationMlPerHour: 750 },
      { maxWbgtC: 32.5, workMinutes: 30, restMinutes: 30, recommendedRestLocation: 'air_conditioned_rest', hydrationMlPerHour: 750 },
      { maxWbgtC: 34.0, workMinutes: 15, restMinutes: 45, recommendedRestLocation: 'air_conditioned_rest', hydrationMlPerHour: 1000 },
      { maxWbgtC: 99.0, workMinutes: 0, restMinutes: 60, recommendedRestLocation: 'air_conditioned_rest', hydrationMlPerHour: 1000 },
    ],
    moderate: [
      { maxWbgtC: 27.5, workMinutes: 60, restMinutes: 0, recommendedRestLocation: 'none_needed', hydrationMlPerHour: 500 },
      { maxWbgtC: 29.5, workMinutes: 45, restMinutes: 15, recommendedRestLocation: 'shaded_shelter', hydrationMlPerHour: 750 },
      { maxWbgtC: 31.0, workMinutes: 30, restMinutes: 30, recommendedRestLocation: 'shaded_shelter', hydrationMlPerHour: 750 },
      { maxWbgtC: 32.5, workMinutes: 15, restMinutes: 45, recommendedRestLocation: 'air_conditioned_rest', hydrationMlPerHour: 1000 },
      { maxWbgtC: 99.0, workMinutes: 0, restMinutes: 60, recommendedRestLocation: 'air_conditioned_rest', hydrationMlPerHour: 1000 },
    ],
    heavy: [
      { maxWbgtC: 25.5, workMinutes: 60, restMinutes: 0, recommendedRestLocation: 'none_needed', hydrationMlPerHour: 750 },
      { maxWbgtC: 27.5, workMinutes: 45, restMinutes: 15, recommendedRestLocation: 'shaded_shelter', hydrationMlPerHour: 750 },
      { maxWbgtC: 29.5, workMinutes: 30, restMinutes: 30, recommendedRestLocation: 'shaded_shelter', hydrationMlPerHour: 1000 },
      { maxWbgtC: 31.0, workMinutes: 15, restMinutes: 45, recommendedRestLocation: 'air_conditioned_rest', hydrationMlPerHour: 1000 },
      { maxWbgtC: 99.0, workMinutes: 0, restMinutes: 60, recommendedRestLocation: 'air_conditioned_rest', hydrationMlPerHour: 1000 },
    ],
  },
};

export function cloneComplianceConfig(config: ComplianceConfig = DEFAULT_COMPLIANCE_CONFIG): ComplianceConfig {
  return JSON.parse(JSON.stringify(config)) as ComplianceConfig;
}
