import { ComplianceStatus, ExposureType, RestLocationType, WorkloadIntensity } from '../config/complianceConfig';

export type EstimatedRiskLevel = 'Low' | 'Moderate' | 'High' | 'Critical';
export type UserViewMode = 'coordinator' | 'worker';
export type WorkerLanguageCode = 'en' | 'ar' | 'hi' | 'ur';
export type WeatherSyncStatus = 'live' | 'stale' | 'offline';

export interface SitePreset {
  id: string;
  name: string;
  nameAr: string;
  emirate: string;
  latitude: number;
  longitude: number;
  isCustom?: boolean;
}

export interface HourlyEnvMetric {
  timeIso: string;
  hourIndex: number; // 0-23
  hourLabel: string; // e.g. "13:00"
  airTempC: number;
  relativeHumidityPct: number;
  windSpeedKmh: number;
  solarRadiationWm2: number;
  uvIndex: number;
  wetBulbEstimatedC: number;
  globeTempEstimatedC: number;
  wbgtEstimatedC: number;
  heatIndexEstimatedC: number;
  riskLevel: EstimatedRiskLevel;
  isEstimated: true;
}

export interface SiteMeterOverride {
  airTempC: number;
  relativeHumidityPct: number;
  manualWbgtC?: number | null;
  recordedAtIso: string;
  recordedAtDisplay: string;
}

export interface EnvWeatherState {
  site: SitePreset;
  status: WeatherSyncStatus;
  measurementMode?: 'regional_forecast' | 'site_measured';
  siteMeterOverride?: SiteMeterOverride | null;
  fetchedAtIso: string;
  lastUpdatedDisplay: string;
  sourceLabel: string;
  current: HourlyEnvMetric;
  hourly: HourlyEnvMetric[];
  errorMessage?: string;
}

/**
 * Strict anonymized crew-level roster row.
 * Zero worker names, ages, medical history, or personal identifiers allowed.
 */
export interface CrewRosterRow {
  crew_id: string;
  taskType: string;
  workload: WorkloadIntensity;
  exposure: ExposureType;
  shiftStart: string; // "HH:MM"
  shiftEnd: string;   // "HH:MM"
  crewTag?: AcclimatizationStatusTag;
}

export interface ShiftBlockPlan {
  id: string;
  crew_id: string;
  hourIndex: number; // 0-23
  timeRange: string; // "08:00–09:00"
  taskType: string;
  workload: WorkloadIntensity;
  exposure: ExposureType;
  workMinutes: number;
  restMinutes: number;
  restLocation: RestLocationType;
  hydrationMlPerHour: number;
  taskNote: string;
  suggestedTaskReordering?: string;
  isMiddayBreakWindow: boolean;
  wbgtEstimatedC: number;
  heatIndexEstimatedC: number;
  riskLevel: EstimatedRiskLevel;
  coordinatorEdited?: boolean;
}

export interface BlockComplianceResult {
  blockId: string;
  crew_id: string;
  hourIndex: number;
  timeRange: string;
  status: ComplianceStatus;
  triggeredRules: string[];
  reason: string;
  recommendedFix?: string;
}

export interface ScheduleDiffItem {
  crew_id: string;
  timeRange: string;
  field: 'workRest' | 'restLocation' | 'exposure' | 'hydration' | 'taskNote';
  before: string;
  after: string;
}

export interface RestAreaHourlyOccupancy {
  hourIndex: number;
  hourLabel: string;
  crewsResting: number;
  capacityCrews: number;
  overCapacity: boolean;
  firstAiderAvailable: boolean;
}

export interface DangerousConditionAlert {
  id: string;
  crew_id: string;
  timeRange: string;
  severity: 'High' | 'Critical';
  summary: string;
  recommendation: string;
}

export interface SchedulePlanResult {
  planId: string;
  generatedAtIso: string;
  source: 'gemini' | 'deterministic_fallback';
  aiAttempted: boolean;
  aiRejected: boolean;
  aiRejectionReasons: string[];
  validatedByComplianceEngine: boolean;
  overallComplianceStatus: ComplianceStatus;
  complianceChecks: BlockComplianceResult[];
  riskDriversExplanation: string;
  whyThisSchedule: string;
  topTaskReorderingSuggestions: string[];
  blocks: ShiftBlockPlan[];
  approved: boolean;
  approvedAtIso?: string;
  diffFromPrevious: ScheduleDiffItem[];
  restOccupancy?: RestAreaHourlyOccupancy[];
  dangerousConditions?: DangerousConditionAlert[];
}

export type ShadeCoolingType = 'ac_hall' | 'misting_tent' | 'shaded_canopy';

/**
 * Rest station configuration for QR display posters. Strictly zero PII.
 */
export interface RestStationConfig {
  stationId: string;
  stationName: string;
  siteId: string;
  siteName: string;
  coolingType: ShadeCoolingType;
  defaultCrewId?: string;
  capacity?: number;
}

/**
 * Anonymized Shady Area Registry entry logged via QR scan or quick tap.
 * Strictly crew-level — never contains worker names, IDs, or health data.
 */
export interface ShadeCheckInRecord {
  id: string;
  stationId: string;
  stationName: string;
  siteId: string;
  crew_id: string;
  coolingType: ShadeCoolingType;
  checkedInAtIso: string;
  method: 'qr_scan' | 'quick_tap';
}

export type AcclimatizationStatusTag = 'new_to_site' | 'returning_after_leave' | 'acclimatized';

export interface AcclimatizationDayStep {
  day: number;
  maxExposurePct: number;
  recommendedWorkload: WorkloadIntensity;
  workRestNote: string;
  guidanceNote: string;
}

export interface CrewAcclimatizationPlan {
  crew_id: string;
  status: AcclimatizationStatusTag;
  generatedAtIso: string;
  source: 'gemini' | 'deterministic';
  summary: string;
  days: AcclimatizationDayStep[];
  disclaimer: string;
}

export interface SiteReadinessItem {
  id: string;
  label: string;
  labelAr: string;
  checked: boolean;
  note: string;
}

export interface SiteReadinessChecklistState {
  updatedAtIso: string;
  items: SiteReadinessItem[];
  completionPercent: number;
}

export interface CrewZoneAssignment {
  crew_id: string;
  zoneType: 'open_ground' | 'rooftop' | 'trench' | 'confined_space' | 'near_machinery' | 'indoor_shaded';
  darkPpe: boolean;
  reflectiveSurfaces: boolean;
}

export interface DynamicTriggerEvaluation {
  currentLevel: 'Green' | 'Advisory' | 'Restrict' | 'Stop work';
  wbgtEffectiveC: number;
  triggerReason: string;
  recommendedActions: string[];
  lookAheadWarning: string | null;
  threeHourOutlook: Array<{ hourLabel: string; wbgtEstimatedC: number; level: 'Green' | 'Advisory' | 'Restrict' | 'Stop work' }>;
}

export interface HydrationAlertAuditRecord {
  id: string;
  crew_id: string;
  actionLevel: 'Green' | 'Advisory' | 'Restrict' | 'Stop work';
  wbgtEstimatedC: number;
  intervalMinutes: number;
  mlPerBreak: number;
  channel: 'banner' | 'voice' | 'whatsapp';
  status: 'sent' | 'acknowledged';
  sentAtIso: string;
  acknowledgedAtIso?: string;
  messages: { en: string; ar: string; hi: string; ur: string };
}

export interface AnonymousIncidentRecord {
  id: string;
  occurredAtIso: string;
  hourOfDay: number;
  zoneLabel: string;
  airTempC: number;
  wbgtEstimatedC: number;
  actionTaken: string;
  notes: string;
}

export interface AuditGovernanceEntry {
  id: string;
  timestampIso: string;
  planId: string;
  aiSuggestionSummary: string;
  complianceVerdict: 'Compliant' | 'At risk' | 'Violation';
  humanDecision: 'Approved' | 'Edited' | 'Rejected / Replaced';
  details: string;
}

export type DataConfidenceLevel = 'live' | 'forecast' | 'stale';

export interface PortfolioSiteRow {
  siteId: string;
  siteName: string;
  siteNameAr: string;
  emirate: string;
  lat: number;
  lon: number;
  airTempC: number;
  wbgtEstimatedC: number;
  actionLevel: 'Green' | 'Advisory' | 'Restrict' | 'Stop work';
  complianceStatus: 'Compliant' | 'At risk' | 'Violation';
  checklistPercent: number;
  dataConfidence: DataConfidenceLevel;
  lastUpdatedDisplay: string;
  needsAttentionScore: number;
}


