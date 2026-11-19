import React, { useState, useRef } from 'react';
import {
  RiskEvaluation,
  SmartShiftPlan,
  AlertFeedbackState,
  GeminiHeatAdvice,
} from '../types';
import {
  ComplianceConfig,
  ComplianceStatus,
} from '../config/complianceConfig';
import {
  CrewRosterRow,
  EnvWeatherState,
  SchedulePlanResult,
  ShiftBlockPlan,
  SitePreset,
  RestStationConfig,
  ShadeCheckInRecord,
  AcclimatizationStatusTag,
  CrewAcclimatizationPlan,
  SiteReadinessChecklistState,
  CrewZoneAssignment,
  DynamicTriggerEvaluation,
  HydrationAlertAuditRecord,
  AnonymousIncidentRecord,
  AuditGovernanceEntry,
} from '../types/occupational';
import { DEMO_CREWS } from '../data/mockData';
import { UAE_SITE_PRESETS } from '../services/dataService';
import { evaluateHeatRisk } from '../utils/riskEngine';
import {
  Users,
  Calendar,
  Sparkles,
  TrendingUp,
  Download,
  ThumbsUp,
  ThumbsDown,
  CheckCircle,
  AlertTriangle,
  MapPin,
  RefreshCw,
  WifiOff,
  SlidersHorizontal,
  CheckCircle2,
  XCircle,
  Gauge,
} from 'lucide-react';
import { AppLocale, UI_TRANSLATIONS } from '../utils/i18n';
import { DubaiHeatmap } from './DubaiHeatmap';
import { BilingualResultsAudioCard } from './BilingualResultsAudioCard';
import { FlyingCard } from './FlyingCard';
import { RosterIntakeBar } from './coordinator/RosterIntakeBar';
import { ShiftTimelineGrid } from './coordinator/ShiftTimelineGrid';
import { SideGuidancePanel } from './coordinator/SideGuidancePanel';
import { ShadeStationQrCard } from './coordinator/ShadeStationQrCard';
import { TriggerAndTrustBanner } from './coordinator/TriggerAndTrustBanner';
import { Forecast24hChartCard } from './coordinator/Forecast24hChartCard';
import { HSEOperationsSuite } from './coordinator/HSEOperationsSuite';
import { motion, useReducedMotion } from 'motion/react';

interface SupervisorViewProps {
  evaluation: RiskEvaluation;
  onOpenWhyAlert: () => void;
  feedbackState: AlertFeedbackState;
  onRecordFeedback: (type: 'useful' | 'false_alarm') => void;
  smartShiftPlan: SmartShiftPlan | null;
  onRequestPlan: (districtName?: string) => void;
  isPlanLoading: boolean;
  historyWbgt: Array<{ time: string; wbgt: number }>;
  locale?: AppLocale;
  advice?: GeminiHeatAdvice;
  onOpenVoiceQa?: () => void;
  // Occupational UAE Coordinator Workflow Props
  weather: EnvWeatherState;
  selectedSite: SitePreset;
  onSelectPresetSite: (siteId: string) => void;
  onApplyCustomCoords: (name: string, lat: number, lon: number) => void;
  onRefreshWeather: () => void;
  isRefreshingWeather: boolean;
  simulateOffline: boolean;
  onToggleSimulateOffline: (val: boolean) => void;
  roster: CrewRosterRow[];
  onChangeRoster: (rows: CrewRosterRow[], triggerReplan?: boolean) => void;
  coordinatorPlan: SchedulePlanResult;
  isCoordinatorPlanning: boolean;
  isVoiceAlertPlaying: boolean;
  onReplanCoordinator: (forceMockAiViolation?: boolean) => void;
  onApproveCoordinatorPlan: () => void;
  onUpdateScheduleBlock: (updatedBlock: ShiftBlockPlan) => void;
  onCopyWhatsApp: () => Promise<boolean>;
  onExportComplianceCsv: () => void;
  onPrintSchedule: () => void;
  onToggleVoiceAlert: () => void;
  complianceConfig: ComplianceConfig;
  forceMiddaySeason: boolean;
  onToggleForceMiddaySeason: (val: boolean) => void;
  onUpdateComplianceConfig: (updated: ComplianceConfig) => void;
  // Rest Station QR & Shady Area Registry
  shadeRegistry: ShadeCheckInRecord[];
  isRefreshingShadeRegistry: boolean;
  onRefreshShadeRegistry: () => void;
  onClearShadeRegistry: (stationId?: string) => void;
  onSimulateQrScan: (station: RestStationConfig) => void;
  // Extended HSE Suite Props
  triggerEval: DynamicTriggerEvaluation;
  selectedZoneSummary: string;
  checklist: SiteReadinessChecklistState;
  onToggleChecklistItem: (itemId: string) => void;
  onUpdateChecklistNote: (itemId: string, note: string) => void;
  hydrationAlerts: HydrationAlertAuditRecord[];
  onPushHydrationAlert: (
    payload: Omit<HydrationAlertAuditRecord, 'id' | 'sentAtIso' | 'status'>,
    channel: 'banner' | 'voice' | 'whatsapp'
  ) => void;
  onAcknowledgeHydrationAlert: (alertId: string) => void;
  acclimatizationTags: Record<string, AcclimatizationStatusTag>;
  acclimatizationPlans: Record<string, CrewAcclimatizationPlan>;
  onChangeAcclimatizationTag: (crewId: string, tag: AcclimatizationStatusTag) => void;
  onGenerateAcclimatizationPlan: (crewId: string) => void;
  isGeneratingAcclim: boolean;
  zoneAssignments: Record<string, CrewZoneAssignment>;
  onUpdateZoneAssignment: (crewId: string, updated: CrewZoneAssignment) => void;
  incidents: AnonymousIncidentRecord[];
  onLogIncident: (inc: Omit<AnonymousIncidentRecord, 'id'>) => void;
  auditLog: AuditGovernanceEntry[];
  // On-Site Meter Override, Shelter Capacity & Proactive 3-Hour Re-Plan
  onApplySiteMeterReading?: (reading: {
    airTempC: number;
    relativeHumidityPct: number;
    manualWbgtC?: number | null;
  }) => void;
  onClearSiteMeterReading?: () => void;
  siteRestCapacityCrews?: number;
  firstAidersOnDuty?: number;
  onChangeSiteResources?: (capacityCrews: number, firstAiders: number) => void;
  proactiveProposedPlan?: SchedulePlanResult | null;
  onAcceptProactivePlan?: () => void;
  onRejectProactivePlan?: () => void;
  onRejectCoordinatorPlan?: () => void;
}

const ARABIC_CREW_INFO: Record<string, { name: string; task: string; zone: string }> = {
  'crew-a': {
    name: 'فريق أ (حدادة وتجهيز حديد التسليح)',
    task: 'ربط حديد التسليح وتركيب الشباك المسبقة الصنع',
    zone: 'البرج الغربي - المنطقة المظللة 3',
  },
  'crew-b': {
    name: 'فريق ب (تركيب السقالات الهيكلية)',
    task: 'رفع المنصات الموديلية وتثبيت الأنابيب الخارجية',
    zone: 'الواجهة الشمالية - المنصة المرتفعة',
  },
  'crew-c': {
    name: 'فريق ج (صب الخرسانة والأساسات)',
    task: 'صب الخرسانة المستمر والتسوية السطحية',
    zone: 'مدخل القبو والساحة المكشوفة',
  },
};

function getComplianceBadgeStyle(status: ComplianceStatus): string {
  if (status === 'Violation') return 'bg-[#fee2e2] text-[#991b1b] border-[#fca5a5]';
  if (status === 'At risk') return 'bg-[#fef3c7] text-[#92400e] border-[#fde68a]';
  return 'bg-[#edf4f0] text-[#173829] border-[#c3d9cd]';
}

export const SupervisorView: React.FC<SupervisorViewProps> = ({
  evaluation,
  onOpenWhyAlert,
  feedbackState,
  onRecordFeedback,
  smartShiftPlan,
  onRequestPlan,
  isPlanLoading,
  historyWbgt,
  locale = 'en',
  advice,
  onOpenVoiceQa,
  weather,
  selectedSite,
  onSelectPresetSite,
  onApplyCustomCoords,
  onRefreshWeather,
  isRefreshingWeather,
  simulateOffline,
  onToggleSimulateOffline,
  roster,
  onChangeRoster,
  coordinatorPlan,
  isCoordinatorPlanning,
  isVoiceAlertPlaying,
  onReplanCoordinator,
  onApproveCoordinatorPlan,
  onUpdateScheduleBlock,
  onCopyWhatsApp,
  onExportComplianceCsv,
  onPrintSchedule,
  onToggleVoiceAlert,
  complianceConfig,
  forceMiddaySeason,
  onToggleForceMiddaySeason,
  onUpdateComplianceConfig,
  shadeRegistry,
  isRefreshingShadeRegistry,
  onRefreshShadeRegistry,
  onClearShadeRegistry,
  onSimulateQrScan,
  triggerEval,
  selectedZoneSummary,
  checklist,
  onToggleChecklistItem,
  onUpdateChecklistNote,
  hydrationAlerts,
  onPushHydrationAlert,
  onAcknowledgeHydrationAlert,
  acclimatizationTags,
  acclimatizationPlans,
  onChangeAcclimatizationTag,
  onGenerateAcclimatizationPlan,
  isGeneratingAcclim,
  zoneAssignments,
  onUpdateZoneAssignment,
  incidents,
  onLogIncident,
  auditLog,
  onApplySiteMeterReading,
  onClearSiteMeterReading,
  siteRestCapacityCrews = 2,
  firstAidersOnDuty = 2,
  onChangeSiteResources,
  proactiveProposedPlan,
  onAcceptProactivePlan,
  onRejectProactivePlan,
  onRejectCoordinatorPlan,
}) => {
  const t = UI_TRANSLATIONS[locale];
  const isAr = locale === 'ar';
  const prefersReducedMotion = useReducedMotion();
  const [plannedDistrict, setPlannedDistrict] = useState<{ name: string; label: string } | null>(null);
  const smartShiftRef = useRef<HTMLDivElement | null>(null);

  const [showCustomCoords, setShowCustomCoords] = useState(false);
  const [customName, setCustomName] = useState(selectedSite.isCustom ? selectedSite.name : 'Custom UAE Worksite');
  const [customLat, setCustomLat] = useState(String(selectedSite.latitude));
  const [customLon, setCustomLon] = useState(String(selectedSite.longitude));

  const [showSiteMeterForm, setShowSiteMeterForm] = useState(false);
  const [meterTemp, setMeterTemp] = useState(String(weather.siteMeterOverride?.airTempC ?? weather.current.airTempC));
  const [meterRh, setMeterRh] = useState(String(weather.siteMeterOverride?.relativeHumidityPct ?? weather.current.relativeHumidityPct));
  const [meterWbgt, setMeterWbgt] = useState(
    weather.siteMeterOverride?.manualWbgtC != null ? String(weather.siteMeterOverride.manualWbgtC) : ''
  );

  // Compute live risk status for each of the 3 crews (crew-level aggregate only)
  const crewsWithLiveStatus = DEMO_CREWS.map((crew) => {
    const crewEval = evaluateHeatRisk({
      airTemp: evaluation.airTemp,
      humidity: evaluation.humidity,
      globeTemp: evaluation.globeTemp,
      sunExposure: 'full',
      workload: crew.workload,
      acclimatized: crew.acclimatized,
      heavyPPE: crew.heavyPPE,
      exposureHours: crew.exposureHours,
      forceMiddayBan: evaluation.isMiddayBanActive,
    });

    return {
      ...crew,
      liveEvaluation: crewEval,
    };
  });

  const handleSaveCustomCoords = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(customLat);
    const lon = parseFloat(customLon);
    if (Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      onApplyCustomCoords(customName.trim() || 'Custom UAE Site', lat, lon);
      setShowCustomCoords(false);
    }
  };

  const handleSaveSiteMeter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onApplySiteMeterReading) return;
    const tVal = parseFloat(meterTemp);
    const rhVal = parseFloat(meterRh);
    const wbgtVal = meterWbgt.trim() ? parseFloat(meterWbgt) : null;
    if (
      Number.isFinite(tVal) &&
      tVal >= 15 &&
      tVal <= 60 &&
      Number.isFinite(rhVal) &&
      rhVal >= 5 &&
      rhVal <= 100
    ) {
      onApplySiteMeterReading({
        airTempC: tVal,
        relativeHumidityPct: rhVal,
        manualWbgtC: wbgtVal != null && Number.isFinite(wbgtVal) ? wbgtVal : null,
      });
      setShowSiteMeterForm(false);
    }
  };

  // Export CSV Audit for Site Compliance
  const handleExportCsv = () => {
    onExportComplianceCsv();
  };

  const overallComp = coordinatorPlan.overallComplianceStatus;

  return (
    <div className="space-y-6">
      {/* 1. Top Summary & Live Open-Meteo UAE Site Control Banner */}
      <FlyingCard direction="scale" delay={0} onScrollReveal={false}>
        <div className="bg-white border border-[#e5dfd3] rounded-2xl p-5 sm:p-6 shadow-xs hover:shadow-md transition-shadow space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center space-x-3 rtl:space-x-reverse">
              <div className="p-3 rounded-2xl bg-[#edf4f0] text-[#173829]">
                <Users className="w-6 h-6 text-[#173829]" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-black text-[#173829] font-sans">
                    {t.supervisor.overviewTitle}
                  </h2>
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border flex items-center gap-1 ${getComplianceBadgeStyle(overallComp)}`}>
                    {overallComp === 'Violation' ? (
                      <XCircle className="w-3.5 h-3.5" />
                    ) : overallComp === 'At risk' ? (
                      <AlertTriangle className="w-3.5 h-3.5" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    <span>{overallComp}</span>
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                      checklist.completionPercent === 100
                        ? 'bg-[#edf4f0] text-[#166534] border-[#c3d9cd]'
                        : 'bg-[#fef3c7] text-[#92400e] border-[#fde68a]'
                    }`}
                  >
                    {isAr
                      ? `جاهزية الموقع: ${checklist.completionPercent}%`
                      : `Site Readiness: ${checklist.completionPercent}%`}
                  </span>
                </div>
                <p className="text-xs text-[#426050] mt-0.5">
                  {t.supervisor.overviewSubtitle}
                </p>
              </div>
            </div>

            <div className="flex items-center flex-wrap gap-2 print:hidden">
              <button
                onClick={handleExportCsv}
                className="flex items-center space-x-1.5 rtl:space-x-reverse px-4 py-2 rounded-xl bg-[#173829] hover:bg-[#24533d] text-[#f7f5ee] text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{t.supervisor.downloadAuditCsv}</span>
              </button>
            </div>
          </div>

          {/* Live Open-Meteo UAE Site & Meteorological Conditions Bar */}
          <div className="bg-[#f7f5ee] border border-[#e2dcd0] rounded-xl p-3.5 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <MapPin className="w-4 h-4 text-[#173829]" />
                <label htmlFor="supervisor-site-select" className="text-xs font-bold text-[#426050]">
                  {isAr ? 'الموقع (الإمارات):' : 'UAE Site:'}
                </label>
                <select
                  id="supervisor-site-select"
                  value={selectedSite.isCustom ? 'custom' : selectedSite.id}
                  onChange={(e) => {
                    if (e.target.value === 'custom') {
                      setShowCustomCoords(true);
                    } else {
                      setShowCustomCoords(false);
                      onSelectPresetSite(e.target.value);
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl bg-white border border-[#d8d0bf] text-xs font-bold text-[#173829] cursor-pointer"
                >
                  {UAE_SITE_PRESETS.map((site) => (
                    <option key={site.id} value={site.id}>
                      {isAr ? site.nameAr : site.name}
                    </option>
                  ))}
                  <option value="custom">
                    {selectedSite.isCustom
                      ? `${selectedSite.name} (${selectedSite.latitude.toFixed(2)}, ${selectedSite.longitude.toFixed(2)})`
                      : 'Custom Lat / Lon...'}
                  </option>
                </select>

                <button
                  type="button"
                  onClick={() => setShowCustomCoords((v) => !v)}
                  className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-[#eae4d5] border border-[#d8d0bf] text-xs font-bold text-[#173829] flex items-center gap-1 cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Lat/Lon</span>
                </button>

                <button
                  type="button"
                  onClick={onRefreshWeather}
                  disabled={isRefreshingWeather}
                  className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-[#eae4d5] border border-[#d8d0bf] text-xs font-bold text-[#173829] flex items-center gap-1 cursor-pointer disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingWeather ? 'animate-spin' : ''}`} />
                  <span>{isAr ? 'مزامنة الطقس' : 'Sync Live'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!showSiteMeterForm) {
                      setMeterTemp(String(weather.siteMeterOverride?.airTempC ?? weather.current.airTempC));
                      setMeterRh(String(weather.siteMeterOverride?.relativeHumidityPct ?? weather.current.relativeHumidityPct));
                      setMeterWbgt(
                        weather.siteMeterOverride?.manualWbgtC != null ? String(weather.siteMeterOverride.manualWbgtC) : ''
                      );
                    }
                    setShowSiteMeterForm((v) => !v);
                  }}
                  className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1 cursor-pointer ${
                    weather.measurementMode === 'site_measured'
                      ? 'bg-[#173829] text-[#f7f5ee] border-[#173829]'
                      : 'bg-white hover:bg-[#eae4d5] border-[#d8d0bf] text-[#173829]'
                  }`}
                >
                  <Gauge className="w-3.5 h-3.5" />
                  <span>{isAr ? 'قراءة جهاز الموقع' : 'On-Site Meter'}</span>
                </button>

                <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#426050] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={simulateOffline}
                    onChange={(e) => onToggleSimulateOffline(e.target.checked)}
                    className="rounded accent-[#173829]"
                  />
                  <span>{isAr ? 'محاكاة انقطاع الاتصال' : 'Simulate Offline'}</span>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium">
                <span
                  className={`px-2 py-0.5 rounded-lg border font-bold ${
                    weather.measurementMode === 'site_measured'
                      ? 'bg-[#173829] text-[#FAF8F3] border-[#173829]'
                      : 'bg-[#edf4f0] text-[#173829] border-[#c3d9cd]'
                  }`}
                >
                  {weather.measurementMode === 'site_measured'
                    ? isAr
                      ? 'قياس ميداني بالموقع'
                      : 'Site-measured'
                    : isAr
                    ? 'توقعات إقليمية'
                    : 'Regional forecast'}
                </span>
                {weather.status === 'live' ? (
                  <span className="text-[#166534] font-bold">
                    {weather.measurementMode === 'site_measured' ? 'Site Meter Active' : 'Open-Meteo Live'} · Updated {weather.lastUpdatedDisplay} (10m auto-sync)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#fef3c7] border border-[#fde68a] text-[#92400e] font-bold">
                    <WifiOff className="w-3.5 h-3.5" />
                    <span>
                      DATA STALE / OFFLINE · {weather.sourceLabel} · Last updated: {weather.lastUpdatedDisplay}
                    </span>
                  </span>
                )}
              </div>
            </div>

            {showSiteMeterForm && (
              <form onSubmit={handleSaveSiteMeter} className="flex flex-wrap items-end gap-2 pt-2 border-t border-[#e2dcd0]">
                <div>
                  <label className="block text-[10px] font-bold text-[#426050] mb-0.5">
                    {isAr ? 'حرارة الموقع (°C)' : 'Site Air Temp (°C)'}
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="15"
                    max="60"
                    value={meterTemp}
                    onChange={(e) => setMeterTemp(e.target.value)}
                    className="w-24 px-2.5 py-1.5 rounded-lg bg-white border border-[#d8d0bf] text-xs font-mono text-[#173829]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[#426050] mb-0.5">
                    {isAr ? 'الرطوبة (%)' : 'Humidity (%)'}
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="5"
                    max="100"
                    value={meterRh}
                    onChange={(e) => setMeterRh(e.target.value)}
                    className="w-24 px-2.5 py-1.5 rounded-lg bg-white border border-[#d8d0bf] text-xs font-mono text-[#173829]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[#426050] mb-0.5">
                    {isAr ? 'قراءة WBGT اختيارية (°C)' : 'Meter WBGT (opt °C)'}
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Auto"
                    value={meterWbgt}
                    onChange={(e) => setMeterWbgt(e.target.value)}
                    className="w-28 px-2.5 py-1.5 rounded-lg bg-white border border-[#d8d0bf] text-xs font-mono text-[#173829]"
                  />
                </div>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-lg bg-[#173829] text-[#f7f5ee] text-xs font-bold cursor-pointer"
                >
                  {isAr ? 'تطبيق القراءة الميدانية' : 'Apply Site Reading'}
                </button>
                {weather.measurementMode === 'site_measured' && onClearSiteMeterReading && (
                  <button
                    type="button"
                    onClick={() => {
                      onClearSiteMeterReading();
                      setShowSiteMeterForm(false);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-white hover:bg-[#fee2e2] text-[#991b1b] border border-[#fca5a5] text-xs font-bold cursor-pointer"
                  >
                    {isAr ? 'العودة للتوقعات الإقليمية' : 'Revert to Regional Forecast'}
                  </button>
                )}
              </form>
            )}

            {showCustomCoords && (
              <form onSubmit={handleSaveCustomCoords} className="flex flex-wrap items-end gap-2 pt-2 border-t border-[#e2dcd0]">
                <div>
                  <label className="block text-[10px] font-bold text-[#426050] mb-0.5">Site Label</label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-[#d8d0bf] text-xs font-semibold text-[#173829]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[#426050] mb-0.5">Latitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={customLat}
                    onChange={(e) => setCustomLat(e.target.value)}
                    className="w-28 px-2.5 py-1.5 rounded-lg bg-white border border-[#d8d0bf] text-xs font-mono text-[#173829]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[#426050] mb-0.5">Longitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={customLon}
                    onChange={(e) => setCustomLon(e.target.value)}
                    className="w-28 px-2.5 py-1.5 rounded-lg bg-white border border-[#d8d0bf] text-xs font-mono text-[#173829]"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-lg bg-[#173829] text-[#f7f5ee] text-xs font-bold cursor-pointer"
                >
                  Apply Coordinates
                </button>
              </form>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs font-mono">
              <div className="bg-white border border-[#e5dfd3] rounded-lg px-3 py-2">
                <div className="font-sans text-[10px] font-bold text-[#426050]">Air Temp</div>
                <div className="font-extrabold text-[#173829]">{weather.current.airTempC.toFixed(1)}°C</div>
              </div>
              <div className="bg-white border border-[#e5dfd3] rounded-lg px-3 py-2">
                <div className="font-sans text-[10px] font-bold text-[#426050]">Humidity</div>
                <div className="font-extrabold text-[#173829]">{weather.current.relativeHumidityPct}%</div>
              </div>
              <div className="bg-white border border-[#e5dfd3] rounded-lg px-3 py-2">
                <div className="font-sans text-[10px] font-bold text-[#426050]">Wind Speed</div>
                <div className="font-extrabold text-[#173829]">{weather.current.windSpeedKmh.toFixed(1)} km/h</div>
              </div>
              <div className="bg-white border border-[#e5dfd3] rounded-lg px-3 py-2">
                <div className="font-sans text-[10px] font-bold text-[#426050]">Solar / UV</div>
                <div className="font-extrabold text-[#173829]">{weather.current.solarRadiationWm2} W/m² · UV {weather.current.uvIndex.toFixed(1)}</div>
              </div>
              <div className="bg-[#edf4f0] border border-[#c3d9cd] rounded-lg px-3 py-2">
                <div className="font-sans text-[10px] font-bold text-[#173829]">WBGT (estimated)</div>
                <div className="font-extrabold text-[#173829]">{weather.current.wbgtEstimatedC.toFixed(1)}°C</div>
              </div>
              <div className="bg-[#edf4f0] border border-[#c3d9cd] rounded-lg px-3 py-2">
                <div className="font-sans text-[10px] font-bold text-[#173829]">Heat Index (estimated)</div>
                <div className="font-extrabold text-[#173829]">{weather.current.heatIndexEstimatedC.toFixed(1)}°C</div>
              </div>
            </div>
          </div>

          {/* Midday Ban Banner if active */}
          {evaluation.isMiddayBanActive && (
            <div className="p-4 rounded-xl bg-[#fff5f5] border-2 border-[#c81d25] flex items-center space-x-3 rtl:space-x-reverse">
              <AlertTriangle className="w-5 h-5 text-[#c81d25] shrink-0" />
              <div className="text-xs text-[#991b1b]">
                <strong className="font-black text-[#c81d25]">
                  {locale === 'ar'
                    ? 'قاعدة حظر العمل وقت الظهيرة لوزارة الموارد البشرية والتوطين (12:30 - 15:00):'
                    : 'UAE MOHRE Midday Break Rule In Effect (12:30 – 15:00, 15 Jun – 15 Sep):'}
                </strong>{' '}
                {locale === 'ar'
                  ? 'يمنع منعاً باتاً أداء أي أعمال مكشوفة تحت أشعة الشمس المباشرة. يجب نقل جميع الفرق إلى بيئات مكيفة أو استراحات مظللة.'
                  : 'All outdoor work under direct sunlight must cease immediately. Relocate crews to shaded or air-conditioned rest halls.'}
              </div>
            </div>
          )}
        </div>
      </FlyingCard>

      {/* 1a. Dynamic Action Triggers, 3-Hour Look-Ahead & Data Trust / Explainability */}
      <FlyingCard direction="scale" delay={0.03} onScrollReveal={false}>
        <TriggerAndTrustBanner
          locale={locale}
          weather={weather}
          triggerEval={triggerEval}
          config={complianceConfig}
          checklistCompletionPct={checklist.completionPercent}
          selectedZoneSummary={selectedZoneSummary}
          proactiveProposedPlan={proactiveProposedPlan}
          onAcceptProactivePlan={onAcceptProactivePlan}
          onRejectProactivePlan={onRejectProactivePlan}
        />
      </FlyingCard>

      {/* 1a-2. 24-Hour Temperature, Humidity & Calculated WBGT Forecast Line Chart (Recharts) */}
      <FlyingCard direction="scale" delay={0.035} onScrollReveal={false}>
        <Forecast24hChartCard
          locale={locale}
          weather={weather}
          config={complianceConfig}
        />
      </FlyingCard>

      {/* 1b. Anonymized Shift Roster Intake + Compliant Day Timeline + Guidance Side Panel */}
      <FlyingCard direction="bottom" delay={0.04} onScrollReveal={false}>
        <div className="space-y-4">
          <RosterIntakeBar
            locale={locale}
            roster={roster}
            onChangeRoster={onChangeRoster}
            siteRestCapacityCrews={siteRestCapacityCrews}
            firstAidersOnDuty={firstAidersOnDuty}
            onChangeSiteResources={onChangeSiteResources}
          />

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
            <div className="xl:col-span-8 min-w-0">
              <ShiftTimelineGrid
                locale={locale}
                roster={roster}
                weather={weather}
                plan={coordinatorPlan}
                isPlanning={isCoordinatorPlanning}
                isVoicePlaying={isVoiceAlertPlaying}
                onReplan={onReplanCoordinator}
                onApprovePlan={onApproveCoordinatorPlan}
                onRejectPlan={onRejectCoordinatorPlan}
                onUpdateBlock={onUpdateScheduleBlock}
                onCopyWhatsApp={onCopyWhatsApp}
                onExportCsv={onExportComplianceCsv}
                onPrintSchedule={onPrintSchedule}
                onToggleVoiceAlert={onToggleVoiceAlert}
              />
            </div>

            <div className="xl:col-span-4">
              <SideGuidancePanel
                locale={locale}
                plan={coordinatorPlan}
                config={complianceConfig}
                forceMiddaySeason={forceMiddaySeason}
                onToggleForceMiddaySeason={onToggleForceMiddaySeason}
                onUpdateConfig={onUpdateComplianceConfig}
              />
            </div>
          </div>
        </div>
      </FlyingCard>

      {/* 1c. Rest Station QR Code Generator & Shady Area Registry */}
      <FlyingCard direction="scale" delay={0.05}>
        <ShadeStationQrCard
          locale={locale}
          selectedSite={selectedSite}
          roster={roster}
          registryEntries={shadeRegistry}
          isRefreshingRegistry={isRefreshingShadeRegistry}
          onRefreshRegistry={onRefreshShadeRegistry}
          onClearRegistry={onClearShadeRegistry}
          onSimulateQrScan={onSimulateQrScan}
        />
      </FlyingCard>

      {/* 1d. HSE Operations, Readiness Checklist, Hydration Engine, Acclimatization, Zones, What-If, Incident Log, Portfolio, Audit & Impact */}
      <FlyingCard direction="bottom" delay={0.05}>
        <HSEOperationsSuite
          locale={locale}
          weather={weather}
          roster={roster}
          plan={coordinatorPlan}
          config={complianceConfig}
          forceMiddaySeason={forceMiddaySeason}
          checklist={checklist}
          onToggleChecklistItem={onToggleChecklistItem}
          onUpdateChecklistNote={onUpdateChecklistNote}
          hydrationAlerts={hydrationAlerts}
          onPushHydrationAlert={onPushHydrationAlert}
          onAcknowledgeHydrationAlert={onAcknowledgeHydrationAlert}
          acclimatizationTags={acclimatizationTags}
          acclimatizationPlans={acclimatizationPlans}
          onChangeAcclimatizationTag={onChangeAcclimatizationTag}
          onGenerateAcclimatizationPlan={onGenerateAcclimatizationPlan}
          isGeneratingAcclim={isGeneratingAcclim}
          zoneAssignments={zoneAssignments}
          onUpdateZoneAssignment={onUpdateZoneAssignment}
          incidents={incidents}
          onLogIncident={onLogIncident}
          auditLog={auditLog}
          onApprovePlan={onApproveCoordinatorPlan}
        />
      </FlyingCard>

      {/* Accessible Bilingual Results Read & Audio Player for Supervisors */}
      {advice && (
        <FlyingCard direction="left" delay={0.06} onScrollReveal={false}>
          <BilingualResultsAudioCard
            evaluation={evaluation}
            advice={advice}
            locale={locale}
            onOpenVoiceQa={onOpenVoiceQa || (() => {})}
          />
        </FlyingCard>
      )}

      {/* 2. Dubai District Heat Zones Heatmap (Interactive Geospatial Planning) */}
      <FlyingCard direction="right" delay={0.1}>
        <DubaiHeatmap
          locale={locale}
          onSelectDistrictForPlanning={(district) => {
            setPlannedDistrict({
              name: district.name,
              label: locale === 'ar' ? district.nameAr : district.name,
            });
            onRequestPlan(district.name);
            smartShiftRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        />
      </FlyingCard>

      {/* 3. Three Site Crews Real-Time Status Table (Crew-Level Only, Zero Personal Wearables) */}
      <FlyingCard direction="bottom" delay={0.05}>
        <div className="bg-white border border-[#e5dfd3] rounded-2xl p-5 sm:p-6 shadow-xs hover:shadow-md transition-shadow space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-sm text-[#173829] uppercase tracking-wider flex items-center space-x-2 rtl:space-x-reverse">
              <span className="w-2 h-2 rounded-full bg-[#173829]" />
              <span>{t.supervisor.crewGridTitle} (Crew-Level Aggregate)</span>
            </h3>
            <button
              onClick={onOpenWhyAlert}
              className="text-xs text-[#173829] underline hover:text-[#24533d] font-bold"
            >
              {t.supervisor.auditThresholdFormula}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {crewsWithLiveStatus.map((crew, idx) => {
              const isHighOrCritical =
                crew.liveEvaluation.riskLevel === 'High' || crew.liveEvaluation.riskLevel === 'Critical';
              const crewFly =
                idx === 0
                  ? { x: -50, y: 24, rotate: -3 }
                  : idx === 1
                  ? { x: 0, y: 42, rotate: 0 }
                  : { x: 50, y: 24, rotate: 3 };

              return (
                <motion.div
                  key={crew.id}
                  initial={prefersReducedMotion ? false : { opacity: 0, ...crewFly, scale: 0.92 }}
                  whileInView={{ opacity: 1, x: 0, y: 0, rotate: 0, scale: 1 }}
                  viewport={{ once: true, amount: 0.12 }}
                  whileHover={prefersReducedMotion ? undefined : { y: -5, scale: 1.02 }}
                  transition={{ type: 'spring', stiffness: 190, damping: 19, delay: idx * 0.08 }}
                  className={`p-4 rounded-xl border transition-shadow flex flex-col justify-between will-change-transform ${
                    isHighOrCritical
                      ? 'bg-[#fff5f5] border-[#c81d25]/60 shadow-xs'
                      : 'bg-[#f7f5ee] border-[#e2dcd0] hover:bg-white'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-1 mb-2">
                      <div>
                        <h4 className="font-bold text-sm text-[#173829]">
                          {locale === 'ar'
                            ? ARABIC_CREW_INFO[crew.id]?.name || crew.name
                            : crew.name}
                        </h4>
                        <p className="text-[11px] text-[#426050]">
                          {locale === 'ar'
                            ? ARABIC_CREW_INFO[crew.id]?.zone || crew.zone
                            : crew.zone}
                        </p>
                      </div>

                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                          crew.liveEvaluation.riskLevel === 'Critical'
                            ? 'bg-[#c81d25] text-white border-[#c81d25]'
                            : crew.liveEvaluation.riskLevel === 'High'
                            ? 'bg-[#fee2e2] text-[#991b1b] border-[#fca5a5]'
                            : crew.liveEvaluation.riskLevel === 'Moderate'
                            ? 'bg-[#fef3c7] text-[#92400e] border-[#fde68a]'
                            : 'bg-[#edf4f0] text-[#173829] border-[#c3d9cd]'
                        }`}
                      >
                        {crew.liveEvaluation.riskLevel}
                      </span>
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-[#e2dcd0] space-y-1.5 text-xs my-3 shadow-xs">
                      <div className="flex justify-between">
                        <span className="text-[#426050]">{locale === 'ar' ? 'مؤشر WBGT التقديري' : 'Estimated WBGT'}:</span>
                        <strong className="font-mono text-[#173829] font-bold">
                          {crew.liveEvaluation.wbgt.toFixed(1)}°C
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#426050]">{locale === 'ar' ? 'نسبة العمل / الراحة' : 'Work/Rest Ratio'}:</span>
                        <strong className="text-[#173829] font-bold">
                          {crew.liveEvaluation.workRestRatio || crew.liveEvaluation.safeAction}
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#426050]">{locale === 'ar' ? 'طبيعة الجهد' : 'Workload'}:</span>
                        <span className="text-[#426050]">{crew.workload}</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#e2dcd0] flex items-center justify-between text-[11px]">
                    <span className="text-[#426050]">
                      {crew.size} {locale === 'ar' ? 'طاقم الموقع' : 'crew capacity'}
                    </span>
                    <span className="text-[#173829] font-bold">
                      {crew.liveEvaluation.isMiddayBanActive ? 'HALTED' : 'ACTIVE'}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </FlyingCard>

      {/* 3b. Original SmartShift Quick Summary Card (Preserved with Coordinator Review Notice) */}
      <FlyingCard direction="scale" delay={0.06}>
        <div
          ref={smartShiftRef}
          className="bg-white border border-[#e5dfd3] rounded-2xl p-5 sm:p-6 shadow-xs hover:shadow-md transition-shadow space-y-4 scroll-mt-20"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#ece6da]">
            <div className="flex items-center space-x-2.5 rtl:space-x-reverse">
              <div className="p-2.5 rounded-xl bg-[#edf4f0] text-[#173829]">
                <Sparkles className="w-5 h-5 text-[#173829]" />
              </div>
              <div>
                <div className="flex items-center flex-wrap gap-2">
                  <h3 className="font-extrabold text-base text-[#173829]">
                    {t.supervisor.smartShiftTitle}
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#edf4f0] text-[#173829] border border-[#c3d9cd]">
                    AI-generated guidance, coordinator must review.
                  </span>
                  {plannedDistrict && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#173829] text-[#FAF8F3] flex items-center space-x-1 rtl:space-x-reverse">
                      <MapPin className="w-3 h-3" />
                      <span>{plannedDistrict.label}</span>
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#426050] mt-0.5">
                  {t.supervisor.smartShiftSubtitle}
                </p>
              </div>
            </div>

            <button
              onClick={() => onRequestPlan(plannedDistrict?.name)}
              disabled={isPlanLoading}
              className="flex items-center space-x-1.5 rtl:space-x-reverse px-4 py-2 rounded-xl bg-[#173829] hover:bg-[#24533d] text-[#f7f5ee] text-xs font-bold transition-all shadow-xs disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isPlanLoading ? t.supervisor.generatingPlan : t.supervisor.regeneratePlan}</span>
            </button>
          </div>

          {smartShiftPlan && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#f7f5ee] border border-[#e2dcd0]">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#173829] mb-2 flex items-center space-x-1.5 rtl:space-x-reverse">
                  <Calendar className="w-4 h-4 text-[#173829]" />
                  <span>{t.supervisor.shiftTimelineTitle} (06:00 - 18:00 Dubai Time)</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 mt-3">
                  {smartShiftPlan.timeline?.map((slot, idx) => {
                    const slotTime = slot.timeSlot || slot.hours || '';
                    const slotTitle = slot.label || slot.activity || 'Site Shift Window';
                    const slotProtocol = slot.coolingProtocol || slot.zone || '';
                    const isMiddaySlot =
                      slot.isMiddayBan ||
                      slotTime.includes('12:00') ||
                      slotTime.includes('12:30') ||
                      slotTime.includes('13:00') ||
                      slotTime.includes('14:00');
                    return (
                      <motion.div
                        key={idx}
                        initial={prefersReducedMotion ? false : { opacity: 0, y: 26, scale: 0.9 }}
                        whileInView={{ opacity: 1, y: 0, scale: 1 }}
                        viewport={{ once: true, amount: 0.1 }}
                        whileHover={prefersReducedMotion ? undefined : { y: -4, scale: 1.02 }}
                        transition={{ type: 'spring', stiffness: 205, damping: 20, delay: idx * 0.05 }}
                        className={`p-3 rounded-xl border text-xs flex flex-col justify-between space-y-2 will-change-transform ${
                          isMiddaySlot
                            ? 'bg-[#fee2e2] border-[#fca5a5] text-[#991b1b]'
                            : 'bg-white border-[#e2dcd0] text-[#173829]'
                        }`}
                      >
                        <div>
                          <div className="font-mono font-bold text-xs mb-1 flex items-center justify-between gap-1">
                            <span>{slotTime}</span>
                            {isMiddaySlot && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#c81d25] text-white font-sans uppercase shrink-0">
                                Midday Stop
                              </span>
                            )}
                          </div>
                          <div className="font-bold text-xs text-[#173829]">{slotTitle}</div>
                          {slotProtocol && (
                            <div className="text-[11px] text-[#426050] mt-1">{slotProtocol}</div>
                          )}

                          {slot.crewActions && Object.keys(slot.crewActions).length > 0 && (
                            <div className="mt-2 pt-2 border-t border-[#ece6da] space-y-1 text-[10px]">
                              {Object.entries(slot.crewActions).map(([crewKey, actionVal]) => (
                                <div key={crewKey} className="leading-snug">
                                  <strong className="font-bold">{crewKey}:</strong>{' '}
                                  <span className={isMiddaySlot ? 'text-[#7f1d1d]' : 'text-[#426050]'}>
                                    {actionVal}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {slot.risk && (
                          <div className="pt-1 text-[10px] font-mono font-semibold text-[#24533d]">
                            Risk: {slot.risk}
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#edf4f0] border border-[#c3d9cd] text-xs text-[#173829] leading-relaxed space-y-2">
                <div>
                  <strong className="font-bold">{t.supervisor.optimizationRationale}:</strong> {smartShiftPlan.rationale}
                </div>
                {smartShiftPlan.adherenceNotes && smartShiftPlan.adherenceNotes.length > 0 && (
                  <ul className="pt-2 border-t border-[#c3d9cd] space-y-1 text-[11px] text-[#24533d]">
                    {smartShiftPlan.adherenceNotes.map((note, idx) => (
                      <li key={idx} className="flex items-start space-x-1.5 rtl:space-x-reverse">
                        <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{note}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </FlyingCard>

      {/* 4. 5-Minute Rolling WBGT Trend Chart */}
      <FlyingCard direction="left" delay={0.06}>
        <div className="bg-white border border-[#e5dfd3] rounded-2xl p-5 sm:p-6 shadow-xs hover:shadow-md transition-shadow space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 rtl:space-x-reverse">
              <TrendingUp className="w-4 h-4 text-[#173829]" />
              <h3 className="font-extrabold text-sm text-[#173829]">{t.supervisor.trendTitle} (Estimated WBGT)</h3>
            </div>
            <span className="text-xs font-mono text-[#426050]">5m rolling window</span>
          </div>

          <div className="pt-3 flex items-end justify-between h-36 gap-2 border-b border-[#e5dfd3] pb-2">
            {historyWbgt.map((entry, idx) => {
              const heightPercent = Math.min(100, Math.max(20, ((entry.wbgt - 25) / 12) * 100));
              const isHigh = entry.wbgt >= 31.0;
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                  <span className="text-[10px] font-mono font-bold text-[#173829]">
                    {entry.wbgt.toFixed(1)}°
                  </span>
                  <div
                    style={{ height: `${heightPercent}%` }}
                    className={`w-full max-w-[40px] rounded-t-lg transition-all ${
                      isHigh
                        ? 'bg-[#c81d25] shadow-xs'
                        : 'bg-[#173829] hover:bg-[#24533d]'
                    }`}
                  />
                  <span className="text-[10px] font-mono text-[#426050]">{entry.time}</span>
                </div>
              );
            })}
          </div>
        </div>
      </FlyingCard>

      {/* 5. Alert Feedback Loop & Adherence Metrics */}
      <FlyingCard direction="right" delay={0.08}>
        <div className="bg-white border border-[#e5dfd3] rounded-2xl p-5 sm:p-6 shadow-xs hover:shadow-md transition-shadow space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#ece6da]">
            <div>
              <h3 className="font-extrabold text-sm text-[#173829]">{t.supervisor.feedbackTitle}</h3>
              <p className="text-xs text-[#426050] mt-0.5">{t.supervisor.feedbackSubtitle}</p>
            </div>

            <div className="flex items-center space-x-2 rtl:space-x-reverse">
              <button
                onClick={() => onRecordFeedback('useful')}
                className="flex items-center space-x-1.5 rtl:space-x-reverse px-3 py-1.5 rounded-xl bg-[#edf4f0] hover:bg-[#d8e8de] text-[#173829] text-xs font-bold border border-[#c3d9cd] transition-all"
              >
                <ThumbsUp className="w-3.5 h-3.5 text-[#173829]" />
                <span>{t.supervisor.usefulVote} ({feedbackState.usefulCount})</span>
              </button>

              <button
                onClick={() => onRecordFeedback('false_alarm')}
                className="flex items-center space-x-1.5 rtl:space-x-reverse px-3 py-1.5 rounded-xl bg-[#fee2e2] hover:bg-[#fecaca] text-[#991b1b] text-xs font-bold border border-[#fca5a5] transition-all"
              >
                <ThumbsDown className="w-3.5 h-3.5 text-[#c81d25]" />
                <span>{t.supervisor.falseAlarmVote} ({feedbackState.falseAlarmCount})</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-[#f7f5ee] border border-[#e2dcd0]">
              <div className="text-[10px] font-semibold text-[#426050] uppercase">{t.supervisor.leadTimeTitle}</div>
              <div className="text-xl font-black text-[#173829] font-mono mt-0.5">
                {feedbackState.averageLeadTimeMinutes}m
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#f7f5ee] border border-[#e2dcd0]">
              <div className="text-[10px] font-semibold text-[#426050] uppercase">{t.supervisor.adherenceRateTitle}</div>
              <div className="text-xl font-black text-[#173829] font-mono mt-0.5">
                {feedbackState.adherenceRatePercent}%
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#f7f5ee] border border-[#e2dcd0]">
              <div className="text-[10px] font-semibold text-[#426050] uppercase">{t.supervisor.usefulRateTitle}</div>
              <div className="text-xl font-black text-[#173829] font-mono mt-0.5">
                {Math.round((feedbackState.usefulCount / (feedbackState.usefulCount + feedbackState.falseAlarmCount || 1)) * 100)}%
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#f7f5ee] border border-[#e2dcd0]">
              <div className="text-[10px] font-semibold text-[#426050] uppercase">{t.supervisor.statutoryComplianceTitle}</div>
              <div className="text-xl font-black text-[#173829] mt-0.5 flex items-center space-x-1 rtl:space-x-reverse">
                <CheckCircle className="w-5 h-5 text-[#24533d]" />
                <span>100%</span>
              </div>
            </div>
          </div>
        </div>
      </FlyingCard>
    </div>
  );
};
