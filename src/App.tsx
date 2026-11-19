import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Role,
  SunExposure,
  WorkloadLevel,
  RiskLevel,
  SupportedLanguage,
  GeminiHeatAdvice,
  SmartShiftPlan,
  AlertFeedbackState,
} from './types';
import {
  ComplianceConfig,
} from './config/complianceConfig';
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
  HydrationAlertAuditRecord,
  AnonymousIncidentRecord,
  AuditGovernanceEntry,
} from './types/occupational';
import { evaluateHeatRisk } from './utils/riskEngine';
import { AppLocale } from './utils/i18n';
import {
  UAE_SITE_PRESETS,
  fetchSiteWeatherData,
  applySiteMeterOverride,
  loadSiteSettings,
  saveSiteSettings,
} from './services/dataService';
import {
  computeRestAreaOccupancy,
  detectDangerousConditions,
  generateDeterministicScheduleBlocks,
  validateScheduleBlocks,
} from './services/complianceEngine';
import { planCompliantSchedule } from './services/aiPlanner';
import { appendAuditEntry, createAuditEntry } from './services/auditLog';
import {
  broadcastVoiceScheduleAlert,
  exportScheduleComplianceCsv,
  formatWhatsAppScheduleText,
  stopVoiceScheduleAlert,
  triggerCsvDownload,
} from './services/alertService';
import {
  clearShadeRegistry,
  fetchShadeRegistry,
  parseCheckInQueryParams,
  recordShadeCheckIn,
} from './services/shadeRegistryService';
import { estimateEnvironmentalHeatMetrics } from './services/wbgtCalculator';
import {
  DEFAULT_DEMO_INCIDENTS,
  buildInitialReadinessState,
  computeReadinessCompletion,
  evaluateDynamicTriggers,
  evaluateZoneAndPpeContext,
  generateDeterministicAcclimatizationPlan,
} from './services/coordinatorEngines';
import { Header } from './components/Header';
import { OfflineModeBanner } from './components/PWAInstallButton';
import { WorkerView } from './components/WorkerView';
import { RiderView } from './components/RiderView';
import { SupervisorView } from './components/SupervisorView';
import { DemoControlsDrawer } from './components/DemoControlsDrawer';
import { WhyAlertDrawer } from './components/WhyAlertDrawer';
import { EvidenceModal } from './components/EvidenceModal';
import { ImpactModal } from './components/ImpactModal';
import { LandingPage } from './components/LandingPage';
import { TeamPage } from './components/TeamPage';
import { VoiceQaModal } from './components/VoiceQaModal';
import { Footer } from './components/Footer';
import { HeroBanner } from './components/HeroBanner';
import { WifiOff, HardHat, Bike, Users, Mic, ShieldCheck, Droplets, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

const OFFLINE_OPS_CACHE_KEY = 'heatshield_ops_state_v1';

interface CachedOpsState {
  approvedPlan?: SchedulePlanResult;
  checklist?: SiteReadinessChecklistState;
  acclimatizationTags?: Record<string, AcclimatizationStatusTag>;
  acclimatizationPlans?: Record<string, CrewAcclimatizationPlan>;
  zoneAssignments?: Record<string, CrewZoneAssignment>;
  hydrationAlerts?: HydrationAlertAuditRecord[];
  incidents?: AnonymousIncidentRecord[];
  auditLog?: AuditGovernanceEntry[];
  siteRestCapacityCrews?: number;
  firstAidersOnDuty?: number;
}

function loadCachedOpsState(): CachedOpsState {
  try {
    const raw = localStorage.getItem(OFFLINE_OPS_CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as CachedOpsState;
  } catch {
    return {};
  }
}

function isTeamPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, '').toLowerCase();
  return normalized === '/team' || normalized === '/contact';
}

function buildInitialWeather(site: SitePreset): EnvWeatherState {
  const nowIso = new Date().toISOString();
  const hourly = Array.from({ length: 24 }, (_, h) => {
    const temp = Number((30 + 11 * Math.max(0, Math.sin(((h - 6) / 14) * Math.PI))).toFixed(1));
    const rh = Math.round(Math.max(30, 62 - (temp - 30) * 1.8));
    const solar = h >= 6 && h <= 18 ? Math.round(880 * Math.sin(((h - 6) / 12) * Math.PI)) : 0;
    const wind = 12;
    const est = estimateEnvironmentalHeatMetrics({
      airTempC: temp,
      relativeHumidityPct: rh,
      windSpeedKmh: wind,
      solarRadiationWm2: solar,
      exposure: 'sun',
    });
    return {
      timeIso: `${nowIso.slice(0, 10)}T${String(h).padStart(2, '0')}:00`,
      hourIndex: h,
      hourLabel: `${String(h).padStart(2, '0')}:00`,
      airTempC: temp,
      relativeHumidityPct: rh,
      windSpeedKmh: wind,
      solarRadiationWm2: solar,
      uvIndex: Number(((solar / 950) * 10.5).toFixed(1)),
      ...est,
    };
  });
  const hr = Math.max(0, Math.min(23, new Date().getHours()));
  return {
    site,
    status: 'stale',
    fetchedAtIso: nowIso,
    lastUpdatedDisplay: 'Connecting...',
    sourceLabel: 'Initializing Open-Meteo sync...',
    current: hourly[hr],
    hourly,
  };
}

function buildInitialCoordinatorPlan(
  weather: EnvWeatherState,
  roster: CrewRosterRow[],
  config: ComplianceConfig,
  forceMiddaySeason: boolean,
  siteRestCapacityCrews: number = 2,
  firstAidersOnDuty: number = 2
): SchedulePlanResult {
  const blocks = generateDeterministicScheduleBlocks(roster, weather.hourly, config, {
    forceMiddaySeason,
  });
  const validation = validateScheduleBlocks(blocks, config, { forceMiddaySeason });
  const restOccupancy = computeRestAreaOccupancy(blocks, siteRestCapacityCrews, firstAidersOnDuty);
  const dangerousConditions = detectDangerousConditions(blocks, roster);
  return {
    planId: 'plan-init',
    generatedAtIso: new Date().toISOString(),
    source: 'deterministic_fallback',
    aiAttempted: false,
    aiRejected: false,
    aiRejectionReasons: [],
    validatedByComplianceEngine: true,
    overallComplianceStatus: validation.overallStatus,
    complianceChecks: validation.checks,
    riskDriversExplanation: `Live thermal estimation for ${weather.site.name} evaluates temperature (${weather.current.airTempC.toFixed(1)}°C), humidity (${weather.current.relativeHumidityPct}%), wind (${weather.current.windSpeedKmh} km/h), and solar load (${weather.current.solarRadiationWm2} W/m²).`,
    whyThisSchedule:
      'Enforces UAE MOHRE Midday Break Rule stoppage for direct-sun work (12:30–15:00) and scales hourly work-rest intervals and hydration to estimated WBGT.',
    topTaskReorderingSuggestions: [
      'Front-load heavy open-sun tasks into 06:00–09:30 cooler morning hours.',
      'Pre-position shaded cooling shelters and chilled drinking water before 09:30.',
    ],
    blocks,
    restOccupancy,
    dangerousConditions,
    approved: false,
    diffFromPrevious: [],
  };
}

export default function App() {
  const initialSettings = useMemo(() => loadSiteSettings(), []);

  // Global Interface Locale (English / Dubai Arabic)
  const [locale, setLocale] = useState<AppLocale>(initialSettings.locale);

  // Route state for dedicated /team (/contact) page vs landing & workspace
  const [isTeamPage, setIsTeamPage] = useState<boolean>(() =>
    typeof window !== 'undefined' ? isTeamPath(window.location.pathname) : false
  );

  // Landing Page first screen -> "Continue as Guest" enters the full workspace
  const [hasEnteredApp, setHasEnteredApp] = useState(false);
  const [currentRole, setCurrentRole] = useState<Role>('supervisor');

  // Multilingual alert voice language
  const [currentLang, setCurrentLang] = useState<SupportedLanguage>(
    initialSettings.locale === 'ar' ? 'ar' : 'en'
  );

  // Site Coordinator Live Open-Meteo, Roster & Compliance State (Zero Personal Data)
  const [selectedSiteId, setSelectedSiteId] = useState<string>(initialSettings.selectedSiteId);
  const [customSite, setCustomSite] = useState<SitePreset>({
    id: 'custom',
    name: initialSettings.customName,
    nameAr: initialSettings.customName,
    emirate: 'Custom',
    latitude: initialSettings.customLat,
    longitude: initialSettings.customLon,
    isCustom: true,
  });
  const [forceMiddaySeason, setForceMiddaySeason] = useState<boolean>(
    initialSettings.forceMiddaySeason
  );
  const [roster, setRoster] = useState<CrewRosterRow[]>(initialSettings.roster);
  const [complianceConfig, setComplianceConfig] = useState<ComplianceConfig>(
    initialSettings.complianceConfig
  );

  const selectedSite = useMemo<SitePreset>(() => {
    if (selectedSiteId === 'custom') return customSite;
    return UAE_SITE_PRESETS.find((s) => s.id === selectedSiteId) || UAE_SITE_PRESETS[0];
  }, [selectedSiteId, customSite]);

  const [weather, setWeather] = useState<EnvWeatherState>(() => buildInitialWeather(selectedSite));
  const [isRefreshingWeather, setIsRefreshingWeather] = useState(false);
  const [simulateOffline, setSimulateOffline] = useState(false);

  const cachedOps = useMemo(() => loadCachedOpsState(), []);

  const [siteMeterOverride, setSiteMeterOverride] = useState<{
    airTempC: number;
    relativeHumidityPct: number;
    manualWbgtC?: number | null;
  } | null>(null);
  const [siteRestCapacityCrews, setSiteRestCapacityCrews] = useState<number>(
    () => cachedOps.siteRestCapacityCrews ?? 2
  );
  const [firstAidersOnDuty, setFirstAidersOnDuty] = useState<number>(
    () => cachedOps.firstAidersOnDuty ?? 2
  );

  const [coordinatorPlan, setCoordinatorPlan] = useState<SchedulePlanResult>(() => {
    if (cachedOps.approvedPlan && cachedOps.approvedPlan.blocks?.length > 0) {
      return cachedOps.approvedPlan;
    }
    return buildInitialCoordinatorPlan(
      buildInitialWeather(selectedSite),
      roster,
      complianceConfig,
      forceMiddaySeason,
      cachedOps.siteRestCapacityCrews ?? 2,
      cachedOps.firstAidersOnDuty ?? 2
    );
  });
  const [proactiveProposedPlan, setProactiveProposedPlan] = useState<SchedulePlanResult | null>(null);
  const proactiveWarningKeyRef = useRef<string | null>(null);
  const [isCoordinatorPlanning, setIsCoordinatorPlanning] = useState(false);
  const [isVoiceAlertPlaying, setIsVoiceAlertPlaying] = useState(false);

  // Extended 13-Feature Site/Crew State (Strictly Zero Individual Worker Data)
  const [checklist, setChecklist] = useState<SiteReadinessChecklistState>(() =>
    cachedOps.checklist?.items?.length ? cachedOps.checklist : buildInitialReadinessState()
  );
  const [acclimatizationTags, setAcclimatizationTags] = useState<Record<string, AcclimatizationStatusTag>>(
    () => cachedOps.acclimatizationTags || { 'Crew-A': 'acclimatized', 'Crew-B': 'returning_after_leave', 'Crew-C': 'new_to_site' }
  );
  const [acclimatizationPlans, setAcclimatizationPlans] = useState<Record<string, CrewAcclimatizationPlan>>(
    () => cachedOps.acclimatizationPlans || {}
  );
  const [isGeneratingAcclim, setIsGeneratingAcclim] = useState(false);

  const [zoneAssignments, setZoneAssignments] = useState<Record<string, CrewZoneAssignment>>(
    () =>
      cachedOps.zoneAssignments || {
        'Crew-A': { crew_id: 'Crew-A', zoneType: 'open_ground', darkPpe: false, reflectiveSurfaces: false },
        'Crew-B': { crew_id: 'Crew-B', zoneType: 'rooftop', darkPpe: true, reflectiveSurfaces: false },
        'Crew-C': { crew_id: 'Crew-C', zoneType: 'trench', darkPpe: false, reflectiveSurfaces: true },
      }
  );

  const [hydrationAlerts, setHydrationAlerts] = useState<HydrationAlertAuditRecord[]>(
    () => cachedOps.hydrationAlerts || []
  );
  const [activeHydrationBanner, setActiveHydrationBanner] = useState<HydrationAlertAuditRecord | null>(null);

  const [incidents, setIncidents] = useState<AnonymousIncidentRecord[]>(
    () => (cachedOps.incidents && cachedOps.incidents.length > 0 ? cachedOps.incidents : DEFAULT_DEMO_INCIDENTS)
  );

  const [auditLog, setAuditLog] = useState<AuditGovernanceEntry[]>(
    () =>
      cachedOps.auditLog || [
        createAuditEntry({
          idPrefix: 'audit-init',
          planId: 'plan-init',
          aiSuggestionSummary: 'Deterministic UAE baseline schedule generated for Crews A, B, C.',
          complianceVerdict: 'Compliant',
          humanDecision: 'Edited',
          details: 'Initial baseline schedule ready for coordinator review before sending crew alerts.',
        }),
      ]
  );

  // Rest Station QR & Shady Area Registry State (Zero PII)
  const [shadeRegistry, setShadeRegistry] = useState<ShadeCheckInRecord[]>([]);
  const [isRefreshingShadeRegistry, setIsRefreshingShadeRegistry] = useState(false);
  const [scannedStation, setScannedStation] = useState<RestStationConfig | null>(null);
  const [lastShadeCheckIn, setLastShadeCheckIn] = useState<ShadeCheckInRecord | null>(null);
  const qrCheckInHandledRef = useRef(false);

  // Persist ONLY site-level operational settings & offline schedule cache in localStorage
  useEffect(() => {
    saveSiteSettings({
      selectedSiteId,
      customLat: customSite.latitude,
      customLon: customSite.longitude,
      customName: customSite.name,
      locale,
      forceMiddaySeason,
      roster,
      complianceConfig,
    });
  }, [selectedSiteId, customSite, locale, forceMiddaySeason, roster, complianceConfig]);

  useEffect(() => {
    try {
      const payload: CachedOpsState = {
        approvedPlan: coordinatorPlan,
        checklist,
        acclimatizationTags,
        acclimatizationPlans,
        zoneAssignments,
        hydrationAlerts: hydrationAlerts.slice(0, 30),
        incidents: incidents.slice(0, 40),
        auditLog: auditLog.slice(0, 40),
        siteRestCapacityCrews,
        firstAidersOnDuty,
      };
      localStorage.setItem(OFFLINE_OPS_CACHE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore quota errors cleanly
    }
  }, [
    coordinatorPlan,
    checklist,
    acclimatizationTags,
    acclimatizationPlans,
    zoneAssignments,
    hydrationAlerts,
    incidents,
    auditLog,
    siteRestCapacityCrews,
    firstAidersOnDuty,
  ]);

  // Set locale specifically (EN or AR)
  const handleSetLocale = (newLocale: AppLocale) => {
    setLocale(newLocale);
    if (newLocale === 'ar') {
      setCurrentLang('ar');
    } else {
      setCurrentLang('en');
    }
  };

  // Modals & Drawers
  const [isDemoControlsOpen, setIsDemoControlsOpen] = useState(false);
  const [isWhyAlertOpen, setIsWhyAlertOpen] = useState(false);
  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);
  const [isImpactOpen, setIsImpactOpen] = useState(false);
  const [isVoiceQaOpen, setIsVoiceQaOpen] = useState(false);

  // Live / Sensor Polling state
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [sensorUrl, setSensorUrl] = useState('');
  const [sensorStatusMessage, setSensorStatusMessage] = useState<string | undefined>();
  const [showSensorFailBanner, setShowSensorFailBanner] = useState(false);

  // Environmental parameters (Synced with live Open-Meteo & interactive demo controls)
  const [airTemp, setAirTemp] = useState<number>(38.4);
  const [humidity, setHumidity] = useState<number>(52);
  const [rawGlobeTemp, setRawGlobeTemp] = useState<number | null>(45.4);
  const [sunExposure, setSunExposure] = useState<SunExposure>('full');

  // Workload and Modifiers (strictly non-PII environmental/task settings)
  const [workload, setWorkload] = useState<WorkloadLevel>('Moderate');
  const [acclimatized, setAcclimatized] = useState(true);
  const [heavyPPE, setHeavyPPE] = useState(false);
  const [exposureHours, setExposureHours] = useState(3);
  const [isNewWorker, setIsNewWorker] = useState(false);
  const [isMiddayBanSimulated, setIsMiddayBanSimulated] = useState(false);

  // Interactive Hydration Tracker state (shared across Worker & Rider views)
  const [waterMl, setWaterMl] = useState<number>(750);
  const [electrolytesCount, setElectrolytesCount] = useState<number>(1);
  const [hydrationStreak, setHydrationStreak] = useState<number>(3);
  const [lastHydrationTime, setLastHydrationTime] = useState<string | null>(null);

  const handleLogDrink = (
    ml: number,
    isElectrolyte: boolean = false,
    wasOnSchedule: boolean = true
  ) => {
    setWaterMl((prev) => Math.min(8000, prev + ml));
    if (isElectrolyte) {
      setElectrolytesCount((prev) => prev + 1);
    }
    setHydrationStreak((prev) => (wasOnSchedule ? prev + 1 : 1));
    setLastHydrationTime(
      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
  };

  const handleUndoDrink = (ml: number) => {
    setWaterMl((prev) => Math.max(0, prev - ml));
    setHydrationStreak((prev) => Math.max(0, prev - 1));
  };

  // Coordinator Planner Runner + Audit Trail Logger
  const runCoordinatorPlanner = useCallback(
    async (
      targetWeather: EnvWeatherState,
      targetRoster: CrewRosterRow[],
      targetConfig: ComplianceConfig,
      middayActive: boolean,
      prevPlan?: SchedulePlanResult | null,
      forceMockAiViolation: boolean = false
    ) => {
      setIsCoordinatorPlanning(true);
      try {
        const nextPlan = await planCompliantSchedule({
          weather: targetWeather,
          roster: targetRoster,
          config: targetConfig,
          complianceOptions: { forceMiddaySeason: middayActive },
          previousPlan: prevPlan,
          forceMockAiViolation,
          siteRestCapacityCrews,
          firstAidersOnDuty,
          zoneAssignments,
        });
        setCoordinatorPlan(nextPlan);
        const entry = createAuditEntry({
          planId: nextPlan.planId,
          aiSuggestionSummary:
            nextPlan.source === 'gemini'
              ? `Gemini AI drafted ${nextPlan.blocks.length} hourly crew blocks for ${targetWeather.site.name}.`
              : nextPlan.aiRejected
              ? `AI draft rejected (${nextPlan.aiRejectionReasons[0] || 'Rule conflict'}); deterministic fallback applied.`
              : `Deterministic schedule generated for ${targetWeather.site.name}.`,
          complianceVerdict: nextPlan.overallComplianceStatus,
          humanDecision: nextPlan.aiRejected ? 'Rejected / Replaced' : 'Edited',
          details: nextPlan.whyThisSchedule,
        });
        setAuditLog((prev) => appendAuditEntry(prev, entry, 40));
      } finally {
        setIsCoordinatorPlanning(false);
      }
    },
    [siteRestCapacityCrews, firstAidersOnDuty, zoneAssignments]
  );

  const refreshLiveWeather = useCallback(
    async (
      siteToFetch: SitePreset,
      offlineMode: boolean,
      triggerReplan: boolean,
      overrideReading?: { airTempC: number; relativeHumidityPct: number; manualWbgtC?: number | null } | null
    ) => {
      setIsRefreshingWeather(true);
      try {
        const fetchedWeather = await fetchSiteWeatherData(siteToFetch, {
          simulateOffline: offlineMode,
        });
        const effectiveOverride =
          overrideReading !== undefined ? overrideReading : siteMeterOverride;
        const nextWeather = effectiveOverride
          ? applySiteMeterOverride(fetchedWeather, effectiveOverride)
          : fetchedWeather;
        setWeather(nextWeather);
        setAirTemp(nextWeather.current.airTempC);
        setHumidity(nextWeather.current.relativeHumidityPct);
        setRawGlobeTemp(nextWeather.current.globeTempEstimatedC);
        if (triggerReplan) {
          await runCoordinatorPlanner(
            nextWeather,
            roster,
            complianceConfig,
            forceMiddaySeason,
            coordinatorPlan
          );
        }
      } finally {
        setIsRefreshingWeather(false);
      }
    },
    [roster, complianceConfig, forceMiddaySeason, coordinatorPlan, runCoordinatorPlanner, siteMeterOverride]
  );

  // Initial live Open-Meteo load + AI schedule plan on mount
  useEffect(() => {
    let active = true;
    (async () => {
      setIsRefreshingWeather(true);
      const live = await fetchSiteWeatherData(selectedSite, { simulateOffline });
      if (!active) return;
      setWeather(live);
      setAirTemp(live.current.airTempC);
      setHumidity(live.current.relativeHumidityPct);
      setRawGlobeTemp(live.current.globeTempEstimatedC);
      setIsRefreshingWeather(false);
      await runCoordinatorPlanner(live, roster, complianceConfig, forceMiddaySeason, null);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh live conditions every 10 minutes (600,000 ms)
  useEffect(() => {
    const timer = setInterval(() => {
      void refreshLiveWeather(selectedSite, simulateOffline, false);
    }, 600_000);
    return () => clearInterval(timer);
  }, [selectedSite, simulateOffline, refreshLiveWeather]);

  // 60-Second Heat-Wave Scenario Ramp state
  const [isHeatWaveRunning, setIsHeatWaveRunning] = useState(false);
  const [heatWaveSecondsElapsed, setHeatWaveSecondsElapsed] = useState(0);
  const heatWaveIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 5-minute rolling WBGT trend
  const [historyWbgt, setHistoryWbgt] = useState<Array<{ time: string; wbgt: number }>>([
    { time: '13:00', wbgt: 29.8 },
    { time: '13:01', wbgt: 30.2 },
    { time: '13:02', wbgt: 30.7 },
    { time: '13:03', wbgt: 31.4 },
    { time: '13:04', wbgt: 32.1 },
    { time: '13:05', wbgt: 33.2 },
  ]);

  // Alert Feedback state (useful vs false-alarm)
  const [feedbackState, setFeedbackState] = useState<AlertFeedbackState>({
    usefulCount: 14,
    falseAlarmCount: 1,
    averageLeadTimeMinutes: 24,
    adherenceRatePercent: 96,
    eventsLog: [
      {
        id: 'ev-1',
        timestamp: '11:45 AM',
        riskLevel: 'Moderate',
        feedbackType: 'useful',
        wbgt: 29.2,
        actionTaken: '15 min shade rest called for Crew B',
      },
      {
        id: 'ev-2',
        timestamp: '12:20 PM',
        riskLevel: 'High',
        feedbackType: 'useful',
        wbgt: 32.8,
        actionTaken: 'Crew C rotated off exterior concrete pour',
      },
    ],
  });

  // Deterministic rule engine evaluation
  const currentEvaluation = evaluateHeatRisk({
    airTemp,
    humidity,
    globeTemp: rawGlobeTemp,
    sunExposure,
    workload,
    acclimatized,
    heavyPPE,
    exposureHours,
    isNewWorker,
    symptoms: [],
    forceMiddayBan: isMiddayBanSimulated,
  });

  const prevRiskLevelRef = useRef<RiskLevel>(currentEvaluation.riskLevel);
  const prevMiddayBanRef = useRef<boolean>(currentEvaluation.isMiddayBanActive);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Initial Gemini heat advice with authentic Dubai Arabic
  const [advice, setAdvice] = useState<GeminiHeatAdvice>({
    explanation: `Estimated WBGT is ${currentEvaluation.wbgt.toFixed(1)}°C driven by ambient temperature (${airTemp.toFixed(1)}°C), relative humidity (${humidity}%), and direct solar radiant heat. Workload threshold is adjusted for safety.`,
    recommended_actions: [
      currentEvaluation.riskLevel === 'Critical'
        ? 'Stop outdoor work immediately and report to cool zone.'
        : 'Take mandatory 15-minute shaded rest breaks every hour.',
      'Drink 250ml of cold water or electrolyte drink every 15-20 minutes.',
      'Loosen non-essential heavy PPE where safe to facilitate convective cooling.',
    ],
    level_suggestion: currentEvaluation.riskLevel,
    alert_text: {
      en: 'Heat risk is increasing. Please pause work, move to a shaded or cooled area, and inform your coordinator.',
      ar: 'خطر الإجهاد الحراري في تصاعد. يرجى التوقف عن العمل المكشوف، التوجه إلى منطقة مظللة ومكيفة، وتناول الماء البارد فوراً.',
      hi: 'गर्मी का जोखिम बढ़ रहा है। कृपया काम रोकें, छायादार या ठंडे स्थान पर जाएं और अपने सुपरवाइजर को बताएं।',
      ml: 'ചൂട് കൂടുന്നു. ദയവായി ജോലി നിർത്തി തണലിലേക്ക് മാറുക, ധാരാളം വെള്ളം കുടിക്കുക, സൂപ്പർവൈസറെ അറിയിക്കുക.',
      kn: 'ಶಾಖದ ಅಪಾಯ ಹೆಚ್ಚುತ್ತಿದೆ. ದಯವಿಟ್ಟು ಕೆಲಸ ನಿಲ್ಲಿಸಿ, ನೆರಳಿನ ಜಾಗಕ್ಕೆ ಹೋಗಿ ಮತ್ತು ನಿಮ್ಮ ಮೇಲ್ವಿಚಾರಕರಿಗೆ ತಿಳಿಸಿ.',
      ur: 'گرمی کی شدت بڑھ رہی ہے۔ براہ کرم کام روکیں، سائے یا ٹھنڈی جگہ پر جائیں اور نگران کو مطلع کریں۔',
    },
    source: 'deterministic_template',
  });

  // SmartShift Plan state initialized with verified default plan
  const [smartShiftPlan, setSmartShiftPlan] = useState<SmartShiftPlan>({
    rationale:
      'To mitigate severe afternoon thermal strain while strictly abiding by UAE MOHRE Midday Break Rule, heavy physical activities are rescheduled to the early morning (06:00-09:30) and late afternoon (16:00-18:00). All open-sun outdoor work is halted between 12:30 and 15:00.',
    timeline: [
      {
        timeSlot: '06:00 - 09:30',
        label: 'Cool Early Window (Est. WBGT ~25°C)',
        crewActions: {
          'Crew A': 'Steel rebar assembly in shaded yard',
          'Crew B': 'Heavy scaffolding structural erection',
          'Crew C': 'Concrete casting and structural pouring',
        },
        risk: 'Low to Moderate',
        coolingProtocol: 'Hydration every 25 mins',
      },
      {
        timeSlot: '09:30 - 12:30',
        label: 'Escalating Heat Window (Est. WBGT ~29°C - 33°C)',
        crewActions: {
          'Crew A': 'Light prefab alignment with portable mist fans',
          'Crew B': 'Crew rotation: 30 min scaffolding / 15 min shade',
          'Crew C': 'Troweling under canopy; rotate heavy loaders',
        },
        risk: 'Moderate to High',
        coolingProtocol: '15 min shade break per 45 min work; cold electrolyte stations active',
      },
      {
        timeSlot: '12:30 - 15:00',
        label: 'UAE MOHRE MIDDAY BREAK (MANDATORY STOP)',
        crewActions: {
          'Crew A': 'MANDATORY REST in air-conditioned rest station',
          'Crew B': 'MANDATORY REST in air-conditioned rest station',
          'Crew C': 'MANDATORY REST in air-conditioned rest station',
        },
        risk: 'Prohibited - Midday Stop',
        coolingProtocol: 'Full site evacuation from open sun. AC cooling stations open.',
        isMiddayBan: true,
      },
      {
        timeSlot: '15:00 - 16:30',
        label: 'Post-Ban Re-entry (Est. WBGT ~31°C)',
        crewActions: {
          'Crew A': 'Site inspection and tool prep in shaded bays',
          'Crew B': 'Light material logistics and inventory check',
          'Crew C': 'Pre-pour inspection under temporary awnings',
        },
        risk: 'Moderate',
        coolingProtocol: 'Crew hydration check-in; ice towel reapplication',
      },
      {
        timeSlot: '16:30 - 18:00',
        label: 'Evening Cooling Window (Est. WBGT ~27°C)',
        crewActions: {
          'Crew A': 'Final welding inspection & site cleanup',
          'Crew B': 'Complete remaining scaffolding fastening',
          'Crew C': 'Night pour finishing and cover installation',
        },
        risk: 'Low to Moderate',
        coolingProtocol: 'Normal hydration protocol',
      },
    ],
    adherenceNotes: [
      'Aligned with UAE MOHRE Midday Break Rule (12:30 to 15:00, 15 Jun – 15 Sep).',
      'Heavy direct-sun tasks shifted to cooler morning windows.',
      'Crew-level work-rest intervals and hydration stations active.',
    ],
  });
  const [isPlanLoading, setIsPlanLoading] = useState(false);

  // Call Gemini heat-advice API
  const fetchGeminiAdvice = useCallback(
    async (overrideLevel?: RiskLevel) => {
      setIsAiLoading(true);
      try {
        const response = await fetch('/api/gemini/heat-advice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            airTemp,
            humidity,
            globeTemp: currentEvaluation.globeTemp,
            wbgt: currentEvaluation.wbgt,
            workload,
            ppe: heavyPPE,
            acclimatized,
            exposureHours,
            riskLevel: overrideLevel || currentEvaluation.riskLevel,
            symptoms: [],
            isMiddayBanActive: currentEvaluation.isMiddayBanActive,
          }),
        });
        if (response.ok) {
          const data = await response.json();
          setAdvice(data);
        }
      } catch (err) {
        // Silently handled by resilient fallback
      } finally {
        setIsAiLoading(false);
      }
    },
    [
      airTemp,
      humidity,
      currentEvaluation.globeTemp,
      currentEvaluation.wbgt,
      currentEvaluation.riskLevel,
      currentEvaluation.isMiddayBanActive,
      workload,
      heavyPPE,
      acclimatized,
      exposureHours,
    ]
  );

  useEffect(() => {
    if (
      currentEvaluation.riskLevel !== prevRiskLevelRef.current ||
      currentEvaluation.isMiddayBanActive !== prevMiddayBanRef.current
    ) {
      prevRiskLevelRef.current = currentEvaluation.riskLevel;
      prevMiddayBanRef.current = currentEvaluation.isMiddayBanActive;
      fetchGeminiAdvice(currentEvaluation.riskLevel);
    }
  }, [currentEvaluation.riskLevel, currentEvaluation.isMiddayBanActive, fetchGeminiAdvice]);

  // Request SmartShift plan from Gemini on demand
  const handleRequestSmartShiftPlan = async (districtName?: string) => {
    setIsPlanLoading(true);
    try {
      const response = await fetch('/api/gemini/smartshift-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentWbgt: currentEvaluation.wbgt,
          crews: ['Crew A', 'Crew B', 'Crew C'],
          district: districtName,
          forecastSummary: `Ambient air ${airTemp}°C, humidity ${humidity}%, estimated WBGT ${currentEvaluation.wbgt}°C in ${districtName ? `${districtName}, UAE` : 'UAE'}.`,
        }),
      });
      if (response.ok) {
        const planData = await response.json();
        setSmartShiftPlan(planData);
      }
    } catch {
      // Handled cleanly
    } finally {
      setIsPlanLoading(false);
    }
  };

  // Update rolling WBGT history every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setHistoryWbgt((prev) => {
        const updated = [...prev, { time: timeStr, wbgt: currentEvaluation.wbgt }];
        return updated.slice(-15);
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [currentEvaluation.wbgt]);

  // Polling sensor URL every 3 seconds when isLiveMode is true
  useEffect(() => {
    if (!isLiveMode || !sensorUrl.trim()) return;

    let isMounted = true;
    const pollSensor = async () => {
      try {
        const proxyUrl = `/api/sensor-proxy?url=${encodeURIComponent(sensorUrl.trim())}`;
        const res = await fetch(proxyUrl);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        if (isMounted) {
          if (typeof data.t === 'number') setAirTemp(data.t);
          if (typeof data.rh === 'number') setHumidity(data.rh);
          if (data.globe !== undefined) setRawGlobeTemp(data.globe);
          setSensorStatusMessage(`Sensor connected: received reading at ${new Date().toLocaleTimeString()}`);
          setShowSensorFailBanner(false);
        }
      } catch (err: any) {
        if (isMounted) {
          setIsLiveMode(false);
          setShowSensorFailBanner(true);
          setSensorStatusMessage(`Poll error: ${err.message || 'Connection failed'}. Switched to SIMULATED.`);
        }
      }
    };

    pollSensor();
    const timer = setInterval(pollSensor, 3000);
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [isLiveMode, sensorUrl]);

  // 60-Second Heat-Wave Scenario Ramp
  const handleStartHeatWave = () => {
    setIsHeatWaveRunning(true);
    setHeatWaveSecondsElapsed(0);
    setIsLiveMode(false);

    setAirTemp(32.0);
    setHumidity(42);
    setSunExposure('full');

    if (heatWaveIntervalRef.current) clearInterval(heatWaveIntervalRef.current);

    heatWaveIntervalRef.current = setInterval(() => {
      setHeatWaveSecondsElapsed((prev) => {
        const next = prev + 1;
        if (next >= 60) {
          clearInterval(heatWaveIntervalRef.current!);
          setIsHeatWaveRunning(false);
          return 60;
        }

        const targetTemp = 32.0 + (next / 60) * 14.5;
        const targetHum = Math.round(42 + (next / 60) * 30);

        setAirTemp(Number(targetTemp.toFixed(1)));
        setHumidity(targetHum);

        return next;
      });
    }, 1000);
  };

  const handleStopHeatWave = () => {
    if (heatWaveIntervalRef.current) clearInterval(heatWaveIntervalRef.current);
    setIsHeatWaveRunning(false);
  };

  const handleResetToBaseline = () => {
    handleStopHeatWave();
    setIsLiveMode(false);
    setAirTemp(34.0);
    setHumidity(45);
    setSunExposure('shade');
    setRawGlobeTemp(null);
    setWorkload('Moderate');
    setAcclimatized(true);
    setHeavyPPE(false);
    setExposureHours(2);
    setIsNewWorker(false);
    setIsMiddayBanSimulated(false);
    setShowSensorFailBanner(false);
    setSensorStatusMessage('Reset to safe baseline parameters.');
  };

  // Record alert feedback
  const handleRecordFeedback = (type: 'useful' | 'false_alarm') => {
    setFeedbackState((prev) => {
      const isUseful = type === 'useful';
      const updatedUseful = isUseful ? prev.usefulCount + 1 : prev.usefulCount;
      const updatedFalse = !isUseful ? prev.falseAlarmCount + 1 : prev.falseAlarmCount;
      const newEvent = {
        id: `ev-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        riskLevel: currentEvaluation.riskLevel,
        feedbackType: type,
        wbgt: currentEvaluation.wbgt,
        actionTaken: isUseful ? 'Shaded cooling cycle validated' : 'Threshold feedback logged',
      };

      return {
        ...prev,
        usefulCount: updatedUseful,
        falseAlarmCount: updatedFalse,
        eventsLog: [newEvent, ...prev.eventsLog].slice(0, 10),
      };
    });
  };

  // Coordinator Workflow Handlers
  const handleSelectPresetSite = async (siteId: string) => {
    setSelectedSiteId(siteId);
    const nextSite = UAE_SITE_PRESETS.find((s) => s.id === siteId) || UAE_SITE_PRESETS[0];
    await refreshLiveWeather(nextSite, simulateOffline, true);
  };

  const handleApplyCustomCoords = async (name: string, lat: number, lon: number) => {
    const nextCustom: SitePreset = {
      id: 'custom',
      name,
      nameAr: name,
      emirate: 'Custom',
      latitude: lat,
      longitude: lon,
      isCustom: true,
    };
    setCustomSite(nextCustom);
    setSelectedSiteId('custom');
    await refreshLiveWeather(nextCustom, simulateOffline, true);
  };

  const handleToggleOffline = async (val: boolean) => {
    setSimulateOffline(val);
    await refreshLiveWeather(selectedSite, val, false);
  };

  const handleChangeRoster = (rows: CrewRosterRow[], triggerReplan = true) => {
    setRoster(rows);
    const taggedUpdates: Record<string, AcclimatizationStatusTag> = {};
    for (const r of rows) {
      if (r.crewTag) {
        taggedUpdates[r.crew_id] = r.crewTag;
      }
    }
    if (Object.keys(taggedUpdates).length > 0) {
      setAcclimatizationTags((prev) => ({ ...prev, ...taggedUpdates }));
    }
    if (triggerReplan) {
      void runCoordinatorPlanner(weather, rows, complianceConfig, forceMiddaySeason, coordinatorPlan);
    }
  };

  const handleApplySiteMeterReading = (reading: {
    airTempC: number;
    relativeHumidityPct: number;
    manualWbgtC?: number | null;
  }) => {
    setSiteMeterOverride(reading);
    const nextWeather = applySiteMeterOverride(weather, reading);
    setWeather(nextWeather);
    setAirTemp(nextWeather.current.airTempC);
    setHumidity(nextWeather.current.relativeHumidityPct);
    setRawGlobeTemp(nextWeather.current.globeTempEstimatedC);
    const meterEntry = createAuditEntry({
      idPrefix: 'audit-meter',
      planId: coordinatorPlan.planId,
      aiSuggestionSummary: `On-site meter entered: ${reading.airTempC.toFixed(1)}°C, ${Math.round(
        reading.relativeHumidityPct
      )}% RH${reading.manualWbgtC != null ? `, Meter WBGT ${reading.manualWbgtC.toFixed(1)}°C` : ''}.`,
      complianceVerdict: coordinatorPlan.overallComplianceStatus,
      humanDecision: 'Edited',
      details: 'Switched site environmental source from Regional forecast to Site-measured meter and re-evaluated shift blocks.',
    });
    setAuditLog((prev) => appendAuditEntry(prev, meterEntry, 40));
    void runCoordinatorPlanner(nextWeather, roster, complianceConfig, forceMiddaySeason, coordinatorPlan);
  };

  const handleClearSiteMeterReading = () => {
    setSiteMeterOverride(null);
    void refreshLiveWeather(selectedSite, simulateOffline, true, null);
  };

  const handleChangeSiteResources = (capacityCrews: number, firstAiders: number) => {
    const safeCap = Math.max(1, capacityCrews);
    const safeAiders = Math.max(0, firstAiders);
    setSiteRestCapacityCrews(safeCap);
    setFirstAidersOnDuty(safeAiders);
    setCoordinatorPlan((prev) => ({
      ...prev,
      restOccupancy: computeRestAreaOccupancy(prev.blocks, safeCap, safeAiders),
    }));
  };

  const handleUpdateScheduleBlock = (updatedBlock: ShiftBlockPlan) => {
    const nextBlocks = coordinatorPlan.blocks.map((b) =>
      b.id === updatedBlock.id ? updatedBlock : b
    );
    const revalidation = validateScheduleBlocks(nextBlocks, complianceConfig, {
      forceMiddaySeason,
    });
    const restOccupancy = computeRestAreaOccupancy(nextBlocks, siteRestCapacityCrews, firstAidersOnDuty);
    const dangerousConditions = detectDangerousConditions(nextBlocks, roster, zoneAssignments);
    setCoordinatorPlan((prev) => ({
      ...prev,
      blocks: nextBlocks,
      restOccupancy,
      dangerousConditions,
      overallComplianceStatus: revalidation.overallStatus,
      complianceChecks: revalidation.checks,
      approved: false,
    }));
    const editEntry = createAuditEntry({
      idPrefix: 'audit-edit',
      planId: coordinatorPlan.planId,
      aiSuggestionSummary: `Crew ${updatedBlock.crew_id} @ ${updatedBlock.timeRange}: ${updatedBlock.taskType}`,
      complianceVerdict: revalidation.overallStatus,
      humanDecision: 'Edited',
      details: `Coordinator updated ${updatedBlock.crew_id} (${updatedBlock.workMinutes}m work / ${updatedBlock.restMinutes}m rest, ${updatedBlock.exposure}). Approval reset until re-approved.`,
    });
    setAuditLog((prev) => appendAuditEntry(prev, editEntry, 40));
  };

  const handleUpdateComplianceConfig = (updated: ComplianceConfig) => {
    setComplianceConfig(updated);
    const revalidation = validateScheduleBlocks(coordinatorPlan.blocks, updated, {
      forceMiddaySeason,
    });
    setCoordinatorPlan((prev) => ({
      ...prev,
      overallComplianceStatus: revalidation.overallStatus,
      complianceChecks: revalidation.checks,
    }));
  };

  const handleToggleForceMiddaySeason = (val: boolean) => {
    setForceMiddaySeason(val);
    void runCoordinatorPlanner(weather, roster, complianceConfig, val, coordinatorPlan);
  };

  // Extended Feature Handlers (Strictly Crew/Site-Level Only)
  const zoneCalculations = useMemo(() => {
    const baseWbgt = weather.current.wbgtEstimatedC;
    const hr = weather.current.hourIndex;
    const evals = roster.map((row) => {
      const assign = zoneAssignments[row.crew_id] || {
        crew_id: row.crew_id,
        zoneType: 'open_ground' as const,
        darkPpe: false,
        reflectiveSurfaces: false,
      };
      return evaluateZoneAndPpeContext(assign, row.workload, hr, baseWbgt, complianceConfig);
    });
    const maxOffset = evals.length > 0 ? Math.max(...evals.map((e) => e.totalOffsetC)) : 0;
    const hottest = evals.find((e) => e.totalOffsetC === maxOffset);
    const selectedZoneSummary = hottest
      ? `${hottest.transparentFormulaNote}`
      : 'Standard open-ground zone baseline';
    return { maxOffset, selectedZoneSummary };
  }, [roster, zoneAssignments, weather.current.wbgtEstimatedC, weather.current.hourIndex, complianceConfig]);

  const triggerEval = useMemo(
    () =>
      evaluateDynamicTriggers(
        weather,
        complianceConfig,
        zoneCalculations.maxOffset,
        forceMiddaySeason
      ),
    [weather, complianceConfig, zoneCalculations.maxOffset, forceMiddaySeason]
  );

  // Proactive 3-hour look-ahead auto-replan proposal (never overrides approved plan or alerts crews without coordinator decision)
  useEffect(() => {
    if (!triggerEval.lookAheadWarning || weather.lastUpdatedDisplay === 'Connecting...') {
      return;
    }
    const warningKey = `${selectedSite.id}|${triggerEval.lookAheadWarning}|${weather.current.wbgtEstimatedC.toFixed(1)}`;
    if (proactiveWarningKeyRef.current === warningKey) {
      return;
    }
    proactiveWarningKeyRef.current = warningKey;
    let active = true;
    (async () => {
      const proposal = await planCompliantSchedule({
        weather,
        roster,
        config: complianceConfig,
        complianceOptions: { forceMiddaySeason },
        previousPlan: coordinatorPlan,
        siteRestCapacityCrews,
        firstAidersOnDuty,
        zoneAssignments,
      });
      if (!active) return;
      setProactiveProposedPlan(proposal);
    })();
    return () => {
      active = false;
    };
  }, [
    triggerEval.lookAheadWarning,
    selectedSite.id,
    weather,
    roster,
    complianceConfig,
    forceMiddaySeason,
    coordinatorPlan,
    siteRestCapacityCrews,
    firstAidersOnDuty,
    zoneAssignments,
  ]);

  const handleAcceptProactivePlan = () => {
    if (!proactiveProposedPlan) return;
    const appliedPlan: SchedulePlanResult = {
      ...proactiveProposedPlan,
      approved: true,
      approvedAtIso: new Date().toISOString(),
    };
    setCoordinatorPlan(appliedPlan);
    setProactiveProposedPlan(null);
    const acceptEntry = createAuditEntry({
      idPrefix: 'audit-proactive-accept',
      planId: appliedPlan.planId,
      aiSuggestionSummary: `Proactive 3-hour escalation schedule applied (${appliedPlan.blocks.length} blocks).`,
      complianceVerdict: appliedPlan.overallComplianceStatus,
      humanDecision: 'Approved',
      details:
        appliedPlan.diffFromPrevious.length > 0
          ? `Coordinator reviewed and approved proactive look-ahead schedule: ${appliedPlan.diffFromPrevious.join('; ')}`
          : 'Coordinator reviewed and approved proactive look-ahead schedule.',
    });
    setAuditLog((prev) => appendAuditEntry(prev, acceptEntry, 40));
  };

  const handleRejectProactivePlan = () => {
    if (!proactiveProposedPlan) return;
    const rejectEntry = createAuditEntry({
      idPrefix: 'audit-proactive-reject',
      planId: proactiveProposedPlan.planId,
      aiSuggestionSummary: `Proactive 3-hour escalation draft dismissed (${proactiveProposedPlan.blocks.length} blocks).`,
      complianceVerdict: proactiveProposedPlan.overallComplianceStatus,
      humanDecision: 'Rejected / Replaced',
      details: 'Coordinator dismissed proactive 3-hour look-ahead draft and retained existing schedule.',
    });
    setAuditLog((prev) => appendAuditEntry(prev, rejectEntry, 40));
    setProactiveProposedPlan(null);
  };

  const handleRejectCoordinatorPlan = () => {
    setCoordinatorPlan((prev) => ({
      ...prev,
      approved: false,
      approvedAtIso: undefined,
    }));
    const rejectEntry = createAuditEntry({
      idPrefix: 'audit-reject',
      planId: coordinatorPlan.planId,
      aiSuggestionSummary: `${coordinatorPlan.blocks.length} hourly crew schedule blocks (${coordinatorPlan.source}).`,
      complianceVerdict: coordinatorPlan.overallComplianceStatus,
      humanDecision: 'Rejected / Replaced',
      details: 'Coordinator rejected current schedule draft. Crew broadcasts remain locked until a revised plan is approved.',
    });
    setAuditLog((prev) => appendAuditEntry(prev, rejectEntry, 40));
  };

  const handleToggleChecklistItem = (itemId: string) => {
    setChecklist((prev) => {
      const items = prev.items.map((item) =>
        item.id === itemId ? { ...item, checked: !item.checked } : item
      );
      return {
        updatedAtIso: new Date().toISOString(),
        items,
        completionPercent: computeReadinessCompletion(items),
      };
    });
  };

  const handleUpdateChecklistNote = (itemId: string, note: string) => {
    setChecklist((prev) => ({
      ...prev,
      updatedAtIso: new Date().toISOString(),
      items: prev.items.map((item) => (item.id === itemId ? { ...item, note } : item)),
    }));
  };

  const handleChangeAcclimatizationTag = (crewId: string, tag: AcclimatizationStatusTag) => {
    setAcclimatizationTags((prev) => ({ ...prev, [crewId]: tag }));
  };

  const handleGenerateAcclimatizationPlan = async (crewId: string) => {
    const status = acclimatizationTags[crewId] || 'new_to_site';
    const crewRow = roster.find((r) => r.crew_id === crewId);
    setIsGeneratingAcclim(true);
    try {
      const res = await fetch('/api/gemini/acclimatization-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          crew_id: crewId,
          status,
          taskType: crewRow?.taskType || 'Outdoor operations',
          siteName: selectedSite.name,
          wbgtEstimatedC: weather.current.wbgtEstimatedC,
        }),
      });
      if (res.ok) {
        const plan = (await res.json()) as CrewAcclimatizationPlan;
        setAcclimatizationPlans((prev) => ({ ...prev, [crewId]: plan }));
        const acclimEntry = createAuditEntry({
          idPrefix: 'audit-acclim',
          planId: coordinatorPlan.planId,
          aiSuggestionSummary: `Generated ${plan.days.length}-day gradual ramp for ${crewId} (${status}).`,
          complianceVerdict: coordinatorPlan.overallComplianceStatus,
          humanDecision: 'Edited',
          details: plan.disclaimer,
        });
        setAuditLog((prev) => appendAuditEntry(prev, acclimEntry, 40));
        return;
      }
    } catch {
      // Fallback below
    } finally {
      setIsGeneratingAcclim(false);
    }
    const fallback = generateDeterministicAcclimatizationPlan(crewId, status, complianceConfig);
    setAcclimatizationPlans((prev) => ({ ...prev, [crewId]: fallback }));
  };

  const handleUpdateZoneAssignment = (crewId: string, updated: CrewZoneAssignment) => {
    setZoneAssignments((prev) => ({ ...prev, [crewId]: updated }));
  };

  const handlePushHydrationAlert = async (
    payload: Omit<HydrationAlertAuditRecord, 'id' | 'sentAtIso' | 'status'>,
    channel: 'banner' | 'voice' | 'whatsapp'
  ) => {
    if (!coordinatorPlan.approved) {
      return; // Mandatory human approval gate
    }
    const newRecord: HydrationAlertAuditRecord = {
      ...payload,
      id: `hyd-${Date.now()}`,
      sentAtIso: new Date().toISOString(),
      channel,
      status: 'sent',
    };
    setHydrationAlerts((prev) => [newRecord, ...prev].slice(0, 30));
    if (channel === 'banner') {
      setActiveHydrationBanner(newRecord);
    } else if (channel === 'voice') {
      try {
        window.speechSynthesis?.cancel();
        const utter = new SpeechSynthesisUtterance(
          locale === 'ar' ? newRecord.messages.ar : newRecord.messages.en
        );
        utter.lang = locale === 'ar' ? 'ar-AE' : 'en-US';
        window.speechSynthesis?.speak(utter);
      } catch {
        // Non-blocking fallback
      }
    } else if (channel === 'whatsapp') {
      try {
        const fullText = `${newRecord.messages.en}\n\n${newRecord.messages.ar}\n\n${newRecord.messages.hi}\n\n${newRecord.messages.ur}`;
        await navigator.clipboard.writeText(fullText);
      } catch {
        // Ignore clipboard errors
      }
    }
    const hydEntry = createAuditEntry({
      idPrefix: 'audit-hyd',
      planId: coordinatorPlan.planId,
      aiSuggestionSummary: `Hydration cadence ${newRecord.intervalMinutes}m (${newRecord.mlPerBreak}ml) for ${newRecord.crew_id}.`,
      complianceVerdict: coordinatorPlan.overallComplianceStatus,
      humanDecision: 'Approved',
      details: `Coordinator pushed ${channel.toUpperCase()} reminder to ${newRecord.crew_id} under Level: ${newRecord.actionLevel}.`,
    });
    setAuditLog((prev) => appendAuditEntry(prev, hydEntry, 40));
  };

  const handleAcknowledgeHydrationAlert = (alertId: string) => {
    const nowIso = new Date().toISOString();
    setHydrationAlerts((prev) =>
      prev.map((a) =>
        a.id === alertId ? { ...a, status: 'acknowledged', acknowledgedAtIso: nowIso } : a
      )
    );
    if (activeHydrationBanner?.id === alertId) {
      setActiveHydrationBanner(null);
    }
  };

  const handleLogIncident = async (inc: Omit<AnonymousIncidentRecord, 'id'>) => {
    const optimistic: AnonymousIncidentRecord = {
      ...inc,
      id: `inc-${Date.now()}`,
    };
    setIncidents((prev) => [optimistic, ...prev]);
    try {
      await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inc),
      });
    } catch {
      // Cached locally cleanly for offline resilience
    }
  };

  const handleCopyWhatsApp = async (): Promise<boolean> => {
    const text = formatWhatsAppScheduleText(coordinatorPlan, weather, roster, locale);
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };

  const handleExportComplianceCsv = () => {
    const csv = exportScheduleComplianceCsv(coordinatorPlan, weather);
    triggerCsvDownload(csv, `heatshield-${weather.site.id}-schedule.csv`);
  };

  const handleToggleVoiceAlert = () => {
    if (isVoiceAlertPlaying) {
      stopVoiceScheduleAlert();
      setIsVoiceAlertPlaying(false);
      return;
    }
    void broadcastVoiceScheduleAlert({
      locale,
      weather,
      plan: coordinatorPlan,
      onStart: () => setIsVoiceAlertPlaying(true),
      onEnd: () => setIsVoiceAlertPlaying(false),
    });
  };

  const handleRefreshShadeRegistry = useCallback(async () => {
    setIsRefreshingShadeRegistry(true);
    try {
      const entries = await fetchShadeRegistry();
      setShadeRegistry(entries);
    } finally {
      setIsRefreshingShadeRegistry(false);
    }
  }, []);

  const handleRecordShadeCheckIn = useCallback(
    async (
      station: RestStationConfig,
      crewId: string,
      method: 'qr_scan' | 'quick_tap'
    ) => {
      const result = await recordShadeCheckIn({
        stationId: station.stationId,
        stationName: station.stationName,
        siteId: station.siteId || selectedSiteId,
        crew_id: crewId,
        coolingType: station.coolingType,
        method,
      });
      setLastShadeCheckIn(result.entry);
      setShadeRegistry(result.entries);
    },
    [selectedSiteId]
  );

  const handleClearShadeRegistry = useCallback(async (stationId?: string) => {
    const remaining = await clearShadeRegistry(stationId);
    setShadeRegistry(remaining);
    if (!stationId) {
      setLastShadeCheckIn(null);
    }
  }, []);

  const handleSimulateQrScan = useCallback(
    (station: RestStationConfig) => {
      setScannedStation(station);
      setHasEnteredApp(true);
      setCurrentRole('worker');
      if (station.defaultCrewId) {
        void handleRecordShadeCheckIn(station, station.defaultCrewId, 'qr_scan');
      } else {
        setLastShadeCheckIn(null);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [handleRecordShadeCheckIn]
  );

  // Sync Shady Area Registry + Anonymous Incident Log on mount + detect ?checkin=1 QR scans
  useEffect(() => {
    void handleRefreshShadeRegistry();
    fetch('/api/incidents')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const fetched = Array.isArray(data?.entries)
          ? (data.entries as AnonymousIncidentRecord[])
          : Array.isArray(data?.incidents)
          ? (data.incidents as AnonymousIncidentRecord[])
          : [];
        if (fetched.length > 0) {
          setIncidents((prev) => {
            const seen = new Set(fetched.map((x) => x.id));
            return [...fetched, ...prev.filter((x) => !seen.has(x.id))].slice(0, 40);
          });
        }
      })
      .catch(() => {
        // Offline safe
      });

    if (typeof window !== 'undefined' && !qrCheckInHandledRef.current) {
      const parsedQr = parseCheckInQueryParams(window.location.search);
      if (parsedQr) {
        qrCheckInHandledRef.current = true;
        const matchedSite =
          UAE_SITE_PRESETS.find((s) => s.id === parsedQr.siteId) || UAE_SITE_PRESETS[0];
        if (parsedQr.siteId && parsedQr.siteId !== 'custom') {
          setSelectedSiteId(matchedSite.id);
        }
        const station: RestStationConfig = {
          stationId: parsedQr.stationId,
          stationName: parsedQr.stationName,
          siteId: parsedQr.siteId,
          siteName: matchedSite.name,
          coolingType: parsedQr.coolingType,
          defaultCrewId: parsedQr.crewId,
        };
        setScannedStation(station);
        setHasEnteredApp(true);
        setCurrentRole('worker');
        if (parsedQr.crewId) {
          void handleRecordShadeCheckIn(station, parsedQr.crewId, 'qr_scan');
        }
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, [handleRefreshShadeRegistry, handleRecordShadeCheckIn]);

  useEffect(() => {
    const handlePopState = () => {
      setIsTeamPage(isTeamPath(window.location.pathname));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleOpenTeamPage = () => {
    if (!isTeamPath(window.location.pathname)) {
      window.history.pushState({}, '', '/team');
    }
    setIsTeamPage(true);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const handleNavigateHome = () => {
    if (window.location.pathname !== '/') {
      window.history.pushState({}, '', '/');
    }
    setIsTeamPage(false);
    setHasEnteredApp(false);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const handleContinueAsGuest = (role: Role) => {
    if (isTeamPath(window.location.pathname)) {
      window.history.pushState({}, '', '/');
    }
    setIsTeamPage(false);
    setCurrentRole(role);
    setHasEnteredApp(true);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  if (isTeamPage) {
    return (
      <>
        <TeamPage
          locale={locale}
          onSetLocale={handleSetLocale}
          onNavigateHome={handleNavigateHome}
          onLaunchWorkspace={() => handleContinueAsGuest(currentRole)}
          onOpenEvidence={() => setIsEvidenceOpen(true)}
          onOpenImpact={() => setIsImpactOpen(true)}
        />

        <EvidenceModal
          isOpen={isEvidenceOpen}
          onClose={() => setIsEvidenceOpen(false)}
          locale={locale}
        />

        <ImpactModal
          isOpen={isImpactOpen}
          onClose={() => setIsImpactOpen(false)}
          feedbackState={feedbackState}
          locale={locale}
        />
      </>
    );
  }

  if (!hasEnteredApp) {
    return (
      <>
        <LandingPage
          evaluation={currentEvaluation}
          locale={locale}
          onSetLocale={handleSetLocale}
          initialRole={currentRole}
          onContinueAsGuest={handleContinueAsGuest}
          onOpenVoiceQa={() => setIsVoiceQaOpen(true)}
          onOpenEvidence={() => setIsEvidenceOpen(true)}
          onOpenImpact={() => setIsImpactOpen(true)}
          onOpenTeam={handleOpenTeamPage}
        />

        <EvidenceModal
          isOpen={isEvidenceOpen}
          onClose={() => setIsEvidenceOpen(false)}
          locale={locale}
        />

        <ImpactModal
          isOpen={isImpactOpen}
          onClose={() => setIsImpactOpen(false)}
          feedbackState={feedbackState}
          locale={locale}
        />

        <VoiceQaModal
          isOpen={isVoiceQaOpen}
          onClose={() => setIsVoiceQaOpen(false)}
          evaluation={currentEvaluation}
          role={currentRole}
          locale={locale}
        />

        {/* Persistent Accessible Voice Assistant Floating Button */}
        <button
          onClick={() => setIsVoiceQaOpen(true)}
          aria-label={locale === 'ar' ? 'المساعد الصوتي للسلامة' : 'Voice Safety Q&A Assistant'}
          title={locale === 'ar' ? 'المساعد الصوتي للسلامة - تحدث بصوتك واستمع للإجابة' : 'Voice Safety Q&A - Speak and listen in English & Arabic'}
          className="fixed bottom-6 right-5 rtl:right-auto rtl:left-5 z-40 bg-[#173829] hover:bg-[#24533D] text-[#FAF8F3] px-3.5 py-3 sm:px-4 sm:py-3.5 rounded-2xl shadow-xl flex items-center space-x-2.5 rtl:space-x-reverse font-bold text-xs sm:text-sm border-2 border-[#FAF8F3] transition-all hover:scale-105 active:scale-95 group cursor-pointer print:hidden"
        >
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#A3E5C1] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-[#A3E5C1]"></span>
          </span>
          <Mic className="w-5 h-5 text-[#A3E5C1] group-hover:animate-pulse" />
          <span className="hidden sm:inline">
            {locale === 'ar' ? 'المساعد الصوتي • اسأل صوتياً' : 'Voice Q&A • Ask with Voice'}
          </span>
        </button>
      </>
    );
  }

  return (
    <div
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      lang={locale}
      className="min-h-screen bg-[#FAF8F3] text-[#173829] flex flex-col font-sans selection:bg-[#173829] selection:text-[#FAF8F3] pb-16 md:pb-0 overflow-x-hidden"
    >
      {/* Persistent Non-Medical & Anti-Misuse Boundary Strip */}
      <div className="bg-[#173829] text-[#FAF8F3] px-4 py-1.5 text-[11px] font-semibold border-b border-[#24533D]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#A3E5C1] shrink-0" />
            <span>
              {locale === 'ar'
                ? 'إرشادات بيئية آلية فقط. ليست تشخيصاً طبياً ولا علاجاً.'
                : 'Automated environmental guidance only. Not a medical diagnosis or treatment.'}
            </span>
          </span>
          <span className="text-[#D7E6DD]">
            {locale === 'ar'
              ? 'يُمنع استخدام هذه الأداة لتقييم الأداء الفردي أو اتخاذ إجراءات تأديبية.'
              : 'This tool must not be used for individual performance evaluation or disciplinary action.'}
          </span>
        </div>
      </div>

      {/* Offline / Stale Mode Banner */}
      <OfflineModeBanner
        lastUpdatedDisplay={weather.lastUpdatedDisplay}
        isDataStale={weather.status !== 'live'}
        locale={locale}
      />

      {/* Active Crew Hydration Reminder Banner (Requires Approved Schedule Gate) */}
      {activeHydrationBanner && (
        <div
          role="alert"
          className="bg-[#173829] text-[#FAF8F3] px-4 py-2.5 text-xs font-bold border-b border-[#A3E5C1]/40 shadow-sm print:hidden"
        >
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Droplets className="w-4 h-4 text-[#A3E5C1] shrink-0" />
              <span>
                {locale === 'ar'
                  ? activeHydrationBanner.messages.ar
                  : activeHydrationBanner.messages.en}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleAcknowledgeHydrationAlert(activeHydrationBanner.id)}
                className="px-2.5 py-1 rounded-lg bg-[#A3E5C1] text-[#173829] font-extrabold text-[11px] cursor-pointer hover:bg-[#8cd8af]"
              >
                {locale === 'ar' ? 'تأكيد استلام الطاقم' : 'Crew Acknowledge'}
              </button>
              <button
                type="button"
                onClick={() => setActiveHydrationBanner(null)}
                className="p-1 rounded-lg hover:bg-white/10 cursor-pointer"
                aria-label="Dismiss hydration banner"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. Header with Role Switcher, Heritage Green Theme & Bilingual Language Selector */}
      <Header
        currentRole={currentRole}
        onSelectRole={(r) => setCurrentRole(r)}
        isLiveMode={isLiveMode || weather.status === 'live'}
        isMiddayBanActive={currentEvaluation.isMiddayBanActive}
        locale={locale}
        onSetLocale={handleSetLocale}
        onOpenDemoControls={() => setIsDemoControlsOpen(true)}
        onOpenEvidence={() => setIsEvidenceOpen(true)}
        onOpenImpact={() => setIsImpactOpen(true)}
        onOpenVoiceQa={() => setIsVoiceQaOpen(true)}
        onBackToLanding={handleNavigateHome}
      />

      {/* Sensor Fallback Warning Banner */}
      {showSensorFailBanner && (
        <div className="bg-[#FEF3C7] text-[#92400E] px-4 py-2.5 text-xs font-bold flex items-center justify-between border-b border-[#FDE68A] shadow-xs">
          <div className="flex items-center space-x-2 rtl:space-x-reverse">
            <WifiOff className="w-4 h-4 shrink-0 text-[#B45309]" />
            <span>
              {locale === 'ar'
                ? 'تعذر الوصول إلى رابط المستشعر. تم التحويل بسلاسة إلى وضع المحاكاة الميدانية الآمن.'
                : 'Sensor URL unreachable. Gracefully fallen back to SIMULATED SENSOR MODE with full functionality.'}
            </span>
          </div>
          <button
            onClick={() => setShowSensorFailBanner(false)}
            className="text-[#92400E] underline hover:text-[#78350F] ml-2 rtl:mr-2 text-xs font-bold"
          >
            {locale === 'ar' ? 'إغلاق' : 'Dismiss'}
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Aesthetically Pleasing Hero Banner with 3D Worker & Phone Mockup Images, Dubai Skyline, and Language Selection */}
        <HeroBanner
          currentRole={currentRole}
          onSelectRole={(r) => setCurrentRole(r)}
          locale={locale}
          onSetLocale={handleSetLocale}
        />

        <AnimatePresence mode="wait">
          <motion.div
            key={currentRole}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -18, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 220, damping: 24 }}
            className="will-change-transform"
          >
            {currentRole === 'worker' && (
              <WorkerView
                evaluation={currentEvaluation}
                advice={advice}
                currentLang={currentLang}
                onChangeLanguage={(l) => setCurrentLang(l)}
                onOpenWhyAlert={() => setIsWhyAlertOpen(true)}
                symptoms={[]}
                onToggleSymptom={() => {}}
                isNewWorker={isNewWorker}
                onToggleNewWorker={(v) => setIsNewWorker(v)}
                isAiLoading={isAiLoading}
                locale={locale}
                onOpenVoiceQa={() => setIsVoiceQaOpen(true)}
                waterMl={waterMl}
                electrolytesCount={electrolytesCount}
                hydrationStreak={hydrationStreak}
                goalStreakDays={4}
                lastHydrationTime={lastHydrationTime}
                onLogDrink={handleLogDrink}
                onUndoDrink={handleUndoDrink}
                roster={roster}
                selectedSite={selectedSite}
                scannedStation={scannedStation}
                lastShadeCheckIn={lastShadeCheckIn}
                onShadeCheckIn={handleRecordShadeCheckIn}
                onDismissScannedStation={() => setScannedStation(null)}
                coordinatorPlan={coordinatorPlan}
              />
            )}

            {currentRole === 'rider' && (
              <RiderView
                evaluation={currentEvaluation}
                advice={advice}
                currentLang={currentLang}
                onChangeLanguage={(l) => setCurrentLang(l)}
                onOpenWhyAlert={() => setIsWhyAlertOpen(true)}
                isAiLoading={isAiLoading}
                locale={locale}
                onOpenVoiceQa={() => setIsVoiceQaOpen(true)}
                waterMl={waterMl}
                electrolytesCount={electrolytesCount}
                hydrationStreak={hydrationStreak}
                goalStreakDays={4}
                lastHydrationTime={lastHydrationTime}
                onLogDrink={handleLogDrink}
                onUndoDrink={handleUndoDrink}
              />
            )}

            {currentRole === 'supervisor' && (
              <SupervisorView
                evaluation={currentEvaluation}
                onOpenWhyAlert={() => setIsWhyAlertOpen(true)}
                feedbackState={feedbackState}
                onRecordFeedback={handleRecordFeedback}
                smartShiftPlan={smartShiftPlan}
                onRequestPlan={handleRequestSmartShiftPlan}
                isPlanLoading={isPlanLoading}
                historyWbgt={historyWbgt}
                locale={locale}
                advice={advice}
                onOpenVoiceQa={() => setIsVoiceQaOpen(true)}
                weather={weather}
                selectedSite={selectedSite}
                onSelectPresetSite={handleSelectPresetSite}
                onApplyCustomCoords={handleApplyCustomCoords}
                onRefreshWeather={() => refreshLiveWeather(selectedSite, simulateOffline, false)}
                isRefreshingWeather={isRefreshingWeather}
                simulateOffline={simulateOffline}
                onToggleSimulateOffline={handleToggleOffline}
                roster={roster}
                onChangeRoster={handleChangeRoster}
                coordinatorPlan={coordinatorPlan}
                isCoordinatorPlanning={isCoordinatorPlanning}
                isVoiceAlertPlaying={isVoiceAlertPlaying}
                onReplanCoordinator={(mockViolation) =>
                  runCoordinatorPlanner(
                    weather,
                    roster,
                    complianceConfig,
                    forceMiddaySeason,
                    coordinatorPlan,
                    mockViolation
                  )
                }
                onApproveCoordinatorPlan={() => {
                  const nextApproved = !coordinatorPlan.approved;
                  setCoordinatorPlan((prev) => ({
                    ...prev,
                    approved: nextApproved,
                    approvedAtIso: nextApproved ? new Date().toISOString() : undefined,
                  }));
                  const approvalEntry = createAuditEntry({
                    idPrefix: 'audit-approve',
                    planId: coordinatorPlan.planId,
                    aiSuggestionSummary: `${coordinatorPlan.blocks.length} hourly crew schedule blocks (${coordinatorPlan.source}).`,
                    complianceVerdict: coordinatorPlan.overallComplianceStatus,
                    humanDecision: nextApproved ? 'Approved' : 'Edited',
                    details: nextApproved
                      ? `Coordinator approved compliant schedule (Readiness ${checklist.completionPercent}%). Voice & WhatsApp crew broadcast unlocked.`
                      : 'Coordinator revoked approval for re-review.',
                  });
                  setAuditLog((prev) => appendAuditEntry(prev, approvalEntry, 40));
                }}
                onUpdateScheduleBlock={handleUpdateScheduleBlock}
                onCopyWhatsApp={handleCopyWhatsApp}
                onExportComplianceCsv={handleExportComplianceCsv}
                onPrintSchedule={() => window.print()}
                onToggleVoiceAlert={handleToggleVoiceAlert}
                complianceConfig={complianceConfig}
                forceMiddaySeason={forceMiddaySeason}
                onToggleForceMiddaySeason={handleToggleForceMiddaySeason}
                onUpdateComplianceConfig={handleUpdateComplianceConfig}
                shadeRegistry={shadeRegistry}
                isRefreshingShadeRegistry={isRefreshingShadeRegistry}
                onRefreshShadeRegistry={handleRefreshShadeRegistry}
                onClearShadeRegistry={handleClearShadeRegistry}
                onSimulateQrScan={handleSimulateQrScan}
                triggerEval={triggerEval}
                selectedZoneSummary={zoneCalculations.selectedZoneSummary}
                checklist={checklist}
                onToggleChecklistItem={handleToggleChecklistItem}
                onUpdateChecklistNote={handleUpdateChecklistNote}
                hydrationAlerts={hydrationAlerts}
                onPushHydrationAlert={handlePushHydrationAlert}
                onAcknowledgeHydrationAlert={handleAcknowledgeHydrationAlert}
                acclimatizationTags={acclimatizationTags}
                acclimatizationPlans={acclimatizationPlans}
                onChangeAcclimatizationTag={handleChangeAcclimatizationTag}
                onGenerateAcclimatizationPlan={handleGenerateAcclimatizationPlan}
                isGeneratingAcclim={isGeneratingAcclim}
                zoneAssignments={zoneAssignments}
                onUpdateZoneAssignment={handleUpdateZoneAssignment}
                incidents={incidents}
                onLogIncident={handleLogIncident}
                auditLog={auditLog}
                onApplySiteMeterReading={handleApplySiteMeterReading}
                onClearSiteMeterReading={handleClearSiteMeterReading}
                siteRestCapacityCrews={siteRestCapacityCrews}
                firstAidersOnDuty={firstAidersOnDuty}
                onChangeSiteResources={handleChangeSiteResources}
                proactiveProposedPlan={proactiveProposedPlan}
                onAcceptProactivePlan={handleAcceptProactivePlan}
                onRejectProactivePlan={handleRejectProactivePlan}
                onRejectCoordinatorPlan={handleRejectCoordinatorPlan}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile Sticky Bottom Navigation Bar (Real App Feel) */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#FAF8F3]/95 backdrop-blur-md border-t border-[#E8E2D5] py-2 px-6 flex justify-around items-center shadow-lg print:hidden"
      >
        <button
          onClick={() => setCurrentRole('worker')}
          className={`flex flex-col items-center py-1 px-3 rounded-xl transition-all ${
            currentRole === 'worker'
              ? 'text-[#173829] font-black'
              : 'text-[#6C8D7B] font-medium'
          }`}
        >
          <HardHat className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">{locale === 'ar' ? 'العامل' : 'Worker'}</span>
        </button>

        <button
          onClick={() => setCurrentRole('rider')}
          className={`flex flex-col items-center py-1 px-3 rounded-xl transition-all ${
            currentRole === 'rider'
              ? 'text-[#173829] font-black'
              : 'text-[#6C8D7B] font-medium'
          }`}
        >
          <Bike className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">{locale === 'ar' ? 'سائق التوصيل' : 'Rider'}</span>
        </button>

        <button
          onClick={() => setCurrentRole('supervisor')}
          className={`flex flex-col items-center py-1 px-3 rounded-xl transition-all ${
            currentRole === 'supervisor'
              ? 'text-[#173829] font-black'
              : 'text-[#6C8D7B] font-medium'
          }`}
        >
          <Users className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">{locale === 'ar' ? 'المشرف' : 'Supervisor'}</span>
        </button>
      </nav>

      {/* Demo Controls Drawer */}
      <DemoControlsDrawer
        isOpen={isDemoControlsOpen}
        onClose={() => setIsDemoControlsOpen(false)}
        sensorUrl={sensorUrl}
        onSetSensorUrl={(u) => setSensorUrl(u)}
        isLiveMode={isLiveMode}
        onToggleLiveMode={(v) => setIsLiveMode(v)}
        sensorStatusMessage={sensorStatusMessage}
        isMiddayBanSimulated={isMiddayBanSimulated}
        onToggleMiddayBan={(v) => setIsMiddayBanSimulated(v)}
        airTemp={airTemp}
        onAirTempChange={(t) => setAirTemp(t)}
        humidity={humidity}
        onHumidityChange={(h) => setHumidity(h)}
        sunExposure={sunExposure}
        onSunExposureChange={(e) => setSunExposure(e)}
        workload={workload}
        onWorkloadChange={(w) => setWorkload(w)}
        acclimatized={acclimatized}
        onAcclimatizedChange={(a) => setAcclimatized(a)}
        heavyPPE={heavyPPE}
        onHeavyPPEChange={(p) => setHeavyPPE(p)}
        exposureHours={exposureHours}
        onExposureHoursChange={(h) => setExposureHours(h)}
        isHeatWaveRunning={isHeatWaveRunning}
        heatWaveSecondsElapsed={heatWaveSecondsElapsed}
        onStartHeatWave={handleStartHeatWave}
        onStopHeatWave={handleStopHeatWave}
        onResetToBaseline={handleResetToBaseline}
        locale={locale}
      />

      {/* "Why This Alert?" Mathematical Transparency Drawer */}
      <WhyAlertDrawer
        isOpen={isWhyAlertOpen}
        onClose={() => setIsWhyAlertOpen(false)}
        evaluation={currentEvaluation}
        locale={locale}
      />

      {/* Evidence & Hardware Guide Modal */}
      <EvidenceModal
        isOpen={isEvidenceOpen}
        onClose={() => setIsEvidenceOpen(false)}
        locale={locale}
      />

      {/* Impact Metrics & Hypotheses Modal */}
      <ImpactModal
        isOpen={isImpactOpen}
        onClose={() => setIsImpactOpen(false)}
        feedbackState={feedbackState}
        locale={locale}
      />

      {/* Voice-Based Question and Answer Facility Modal */}
      <VoiceQaModal
        isOpen={isVoiceQaOpen}
        onClose={() => setIsVoiceQaOpen(false)}
        evaluation={currentEvaluation}
        role={currentRole}
        locale={locale}
      />

      {/* Persistent Accessible Voice Assistant Floating Button */}
      <button
        onClick={() => setIsVoiceQaOpen(true)}
        aria-label={locale === 'ar' ? 'المساعد الصوتي للسلامة' : 'Voice Safety Q&A Assistant'}
        title={locale === 'ar' ? 'المساعد الصوتي للسلامة - تحدث بصوتك واستمع للإجابة' : 'Voice Safety Q&A - Speak and listen in English & Arabic'}
        className="fixed bottom-20 md:bottom-8 right-5 rtl:right-auto rtl:left-5 z-40 bg-[#173829] hover:bg-[#24533D] text-[#FAF8F3] px-3.5 py-3 sm:px-4 sm:py-3.5 rounded-2xl shadow-xl flex items-center space-x-2.5 rtl:space-x-reverse font-bold text-xs sm:text-sm border-2 border-[#FAF8F3] transition-all hover:scale-105 active:scale-95 group print:hidden"
      >
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#A3E5C1] opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-[#A3E5C1]"></span>
        </span>
        <Mic className="w-5 h-5 text-[#A3E5C1] group-hover:animate-pulse" />
        <span className="hidden sm:inline">
          {locale === 'ar' ? 'المساعد الصوتي • اسأل صوتياً' : 'Voice Q&A • Ask with Voice'}
        </span>
      </button>

      {/* Statutory Footer with non-medical disclaimer */}
      <Footer
        onOpenEvidence={() => setIsEvidenceOpen(true)}
        onOpenImpact={() => setIsImpactOpen(true)}
        onOpenTeam={handleOpenTeamPage}
        locale={locale}
      />
    </div>
  );
}
