import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { evaluateHeatRisk } from './utils/riskEngine';
import { AppLocale } from './utils/i18n';
import { Header } from './components/Header';
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
import { WifiOff, HardHat, Bike, Users, Mic } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

function isTeamPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, '').toLowerCase();
  return normalized === '/team' || normalized === '/contact';
}

export default function App() {
  // Global Interface Locale (English / Dubai Arabic)
  const [locale, setLocale] = useState<AppLocale>('en');

  // Route state for dedicated /team (/contact) page vs landing & workspace
  const [isTeamPage, setIsTeamPage] = useState<boolean>(() =>
    typeof window !== 'undefined' ? isTeamPath(window.location.pathname) : false
  );

  // Landing Page first screen -> "Continue as Guest" enters the full workspace
  const [hasEnteredApp, setHasEnteredApp] = useState(false);
  const [currentRole, setCurrentRole] = useState<Role>('worker');

  // Multilingual alert voice language
  const [currentLang, setCurrentLang] = useState<SupportedLanguage>('en');

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

  // Environmental parameters (Simulated / Live)
  const [airTemp, setAirTemp] = useState<number>(38.4);
  const [humidity, setHumidity] = useState<number>(52);
  const [rawGlobeTemp, setRawGlobeTemp] = useState<number | null>(45.4);
  const [sunExposure, setSunExposure] = useState<SunExposure>('full');

  // Workload and Modifiers
  const [workload, setWorkload] = useState<WorkloadLevel>('Moderate');
  const [acclimatized, setAcclimatized] = useState(true);
  const [heavyPPE, setHeavyPPE] = useState(false);
  const [exposureHours, setExposureHours] = useState(3);
  const [isNewWorker, setIsNewWorker] = useState(false);
  const [symptoms, setSymptoms] = useState<string[]>([]);
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
    symptoms,
    forceMiddayBan: isMiddayBanSimulated,
  });

  const prevRiskLevelRef = useRef<RiskLevel>(currentEvaluation.riskLevel);
  const prevMiddayBanRef = useRef<boolean>(currentEvaluation.isMiddayBanActive);
  const prevSymptomsKeyRef = useRef<string>(symptoms.join(','));
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Initial Gemini heat advice with authentic Dubai Arabic
  const [advice, setAdvice] = useState<GeminiHeatAdvice>({
    explanation: `Calculated WBGT is ${currentEvaluation.wbgt.toFixed(1)}°C driven by ambient temperature (${airTemp.toFixed(1)}°C), relative humidity (${humidity}%), and direct solar radiant heat. Workload threshold is adjusted for safety.`,
    recommended_actions: [
      currentEvaluation.riskLevel === 'Critical'
        ? 'Stop outdoor work immediately and report to cool zone.'
        : 'Take mandatory 15-minute shaded rest breaks every hour.',
      'Drink 250ml of cold water or electrolyte drink every 15-20 minutes.',
      'Loosen non-essential heavy PPE where safe to facilitate convective cooling.',
    ],
    level_suggestion: currentEvaluation.riskLevel,
    alert_text: {
      en: 'Heat risk is increasing. Please pause work, move to a shaded or cooled area, and inform your supervisor.',
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
      'To mitigate severe afternoon thermal strain while strictly abiding by UAE ministerial decree, heavy physical activities are rescheduled to the early morning (06:00-09:30) and late afternoon (16:00-18:00). All outdoor work is legally halted between 12:30 and 15:00.',
    timeline: [
      {
        timeSlot: '06:00 - 09:30',
        label: 'Cool Early Window (WBGT ~25°C)',
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
        label: 'Escalating Heat Window (WBGT ~29°C - 33°C)',
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
        label: 'UAE LEGAL MIDDAY BAN (MANDATORY STOP)',
        crewActions: {
          'Crew A': 'MANDATORY REST in air-conditioned rest station',
          'Crew B': 'MANDATORY REST in air-conditioned rest station',
          'Crew C': 'MANDATORY REST in air-conditioned rest station',
        },
        risk: 'Prohibited - Legal Stop',
        coolingProtocol: 'Full site evacuation from open sun. AC cooling stations open.',
        isMiddayBan: true,
      },
      {
        timeSlot: '15:00 - 16:30',
        label: 'Post-Ban Re-entry (WBGT ~31°C)',
        crewActions: {
          'Crew A': 'Site inspection and tool prep in shaded bays',
          'Crew B': 'Light material logistics and inventory check',
          'Crew C': 'Pre-pour inspection under temporary awnings',
        },
        risk: 'Moderate',
        coolingProtocol: 'Buddy hydration check-in; ice towel reapplication',
      },
      {
        timeSlot: '16:30 - 18:00',
        label: 'Evening Cooling Window (WBGT ~27°C)',
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
      '100% compliant with UAE MoHRE Midday Break regulations (12:30 to 15:00).',
      'Crew C (Very Heavy) exposure capped at 90 continuous minutes before mandated AC recovery.',
      'Buddy-system pairs implemented across all 3 crews.',
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
            symptoms,
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
      symptoms,
    ]
  );

  const symptomsKey = symptoms.join(',');

  useEffect(() => {
    if (
      currentEvaluation.riskLevel !== prevRiskLevelRef.current ||
      currentEvaluation.isMiddayBanActive !== prevMiddayBanRef.current ||
      symptomsKey !== prevSymptomsKeyRef.current
    ) {
      prevRiskLevelRef.current = currentEvaluation.riskLevel;
      prevMiddayBanRef.current = currentEvaluation.isMiddayBanActive;
      prevSymptomsKeyRef.current = symptomsKey;
      fetchGeminiAdvice(currentEvaluation.riskLevel);
    }
  }, [currentEvaluation.riskLevel, currentEvaluation.isMiddayBanActive, symptomsKey, fetchGeminiAdvice]);

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
          forecastSummary: `Ambient air ${airTemp}°C, humidity ${humidity}%, WBGT ${currentEvaluation.wbgt}°C in ${districtName ? `${districtName}, Dubai` : 'Dubai'}.`,
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
          console.warn('Sensor fetch failed:', err);
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
    setSymptoms([]);
    setIsMiddayBanSimulated(false);
    setShowSensorFailBanner(false);
    setSensorStatusMessage('Reset to safe baseline parameters.');
  };

  // Symptom toggling
  const handleToggleSymptom = (sympId: string) => {
    if (sympId === 'none') {
      setSymptoms([]);
      return;
    }
    setSymptoms((prev) =>
      prev.includes(sympId) ? prev.filter((s) => s !== sympId) : [...prev, sympId]
    );
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

        {/* Evidence & ESP32 Hardware Guide Modal */}
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
          className="fixed bottom-6 right-5 rtl:right-auto rtl:left-5 z-40 bg-[#173829] hover:bg-[#24533D] text-[#FAF8F3] px-3.5 py-3 sm:px-4 sm:py-3.5 rounded-2xl shadow-xl flex items-center space-x-2.5 rtl:space-x-reverse font-bold text-xs sm:text-sm border-2 border-[#FAF8F3] transition-all hover:scale-105 active:scale-95 group cursor-pointer"
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
      {/* 1. Header with Role Switcher, Heritage Green Theme & Bilingual Language Selector */}
      <Header
        currentRole={currentRole}
        onSelectRole={(r) => setCurrentRole(r)}
        isLiveMode={isLiveMode}
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
                ? 'تعذر الوصول إلى رابط مستشعر ESP32. تم التحويل بسلاسة إلى وضع المحاكاة الميدانية الآمن.'
                : 'ESP32 sensor URL unreachable. Gracefully fallen back to SIMULATED SENSOR MODE with full functionality.'}
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
                symptoms={symptoms}
                onToggleSymptom={handleToggleSymptom}
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
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile Sticky Bottom Navigation Bar (Real App Feel) */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#FAF8F3]/95 backdrop-blur-md border-t border-[#E8E2D5] py-2 px-6 flex justify-around items-center shadow-lg"
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

      {/* Evidence & ESP32 Hardware Guide Modal */}
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
        className="fixed bottom-20 md:bottom-8 right-5 rtl:right-auto rtl:left-5 z-40 bg-[#173829] hover:bg-[#24533D] text-[#FAF8F3] px-3.5 py-3 sm:px-4 sm:py-3.5 rounded-2xl shadow-xl flex items-center space-x-2.5 rtl:space-x-reverse font-bold text-xs sm:text-sm border-2 border-[#FAF8F3] transition-all hover:scale-105 active:scale-95 group"
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
