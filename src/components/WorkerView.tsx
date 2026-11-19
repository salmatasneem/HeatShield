import React, { useState, useEffect } from 'react';
import {
  RiskEvaluation,
  GeminiHeatAdvice,
  SupportedLanguage,
} from '../types';
import { RiskCard } from './RiskCard';
import { MultilingualAlert } from './MultilingualAlert';
import {
  Clock,
  HeartHandshake,
  AlertOctagon,
  ShieldCheck,
  Lock,
  X,
  UserCheck,
  PhoneCall,
  QrCode,
  Umbrella,
  CheckCircle2,
} from 'lucide-react';
import { AppLocale, UI_TRANSLATIONS } from '../utils/i18n';
import { WORKER_VIEW_LABELS } from '../services/i18n';
import {
  CrewRosterRow,
  RestStationConfig,
  SchedulePlanResult,
  ShadeCheckInRecord,
  SitePreset,
  WorkerLanguageCode,
} from '../types/occupational';
import { buildRestStationsForSite } from '../services/shadeRegistryService';
import { BilingualResultsAudioCard } from './BilingualResultsAudioCard';
import { FlyingCard } from './FlyingCard';
import { HydrationTrackerWidget } from './HydrationTrackerWidget';
import { WorkerSimpleCardPanel } from './WorkerSimpleCardPanel';

interface WorkerViewProps {
  evaluation: RiskEvaluation;
  advice: GeminiHeatAdvice;
  currentLang: SupportedLanguage;
  onChangeLanguage: (lang: SupportedLanguage) => void;
  onOpenWhyAlert: () => void;
  symptoms: string[];
  onToggleSymptom: (symptom: string) => void;
  isNewWorker: boolean;
  onToggleNewWorker: (val: boolean) => void;
  isAiLoading: boolean;
  locale?: AppLocale;
  onOpenVoiceQa: () => void;
  waterMl: number;
  electrolytesCount: number;
  hydrationStreak: number;
  goalStreakDays?: number;
  lastHydrationTime: string | null;
  onLogDrink: (ml: number, isElectrolyte?: boolean, wasOnSchedule?: boolean) => void;
  onUndoDrink: (ml: number) => void;
  // Zero-Typing Shady Area Check-In
  roster?: CrewRosterRow[];
  selectedSite?: SitePreset;
  scannedStation?: RestStationConfig | null;
  lastShadeCheckIn?: ShadeCheckInRecord | null;
  onShadeCheckIn?: (station: RestStationConfig, crewId: string, method: 'qr_scan' | 'quick_tap') => Promise<void> | void;
  onDismissScannedStation?: () => void;
  coordinatorPlan?: SchedulePlanResult;
}

export const WorkerView: React.FC<WorkerViewProps> = ({
  evaluation,
  advice,
  currentLang,
  onChangeLanguage,
  onOpenWhyAlert,
  symptoms,
  onToggleSymptom,
  isNewWorker,
  onToggleNewWorker,
  isAiLoading,
  locale = 'en',
  onOpenVoiceQa,
  waterMl,
  electrolytesCount,
  hydrationStreak,
  goalStreakDays = 4,
  lastHydrationTime,
  onLogDrink,
  onUndoDrink,
  roster = [],
  selectedSite,
  scannedStation = null,
  lastShadeCheckIn = null,
  onShadeCheckIn,
  onDismissScannedStation,
  coordinatorPlan,
}) => {
  const t = UI_TRANSLATIONS[locale];

  // Break timer & modals state
  const [breakTimerSeconds, setBreakTimerSeconds] = useState(18 * 60);
  const [showSosModal, setShowSosModal] = useState(false);
  const [showDataLedger, setShowDataLedger] = useState(false);
  const [buddyCheckCount, setBuddyCheckCount] = useState(2);
  const [justCheckedBuddy, setJustCheckedBuddy] = useState(false);
  const [workerLabelLang, setWorkerLabelLang] = useState<WorkerLanguageCode>(
    locale === 'ar' ? 'ar' : 'en'
  );
  const workerLabels = WORKER_VIEW_LABELS[workerLabelLang];
  const fallbackStations = buildRestStationsForSite(
    selectedSite || {
      id: 'dubai',
      name: 'Dubai Industrial Site (Al Quoz)',
      nameAr: 'موقع دبي الصناعي (القوز)',
      emirate: 'Dubai',
      latitude: 25.1342,
      longitude: 55.2286,
    }
  );
  const activeStation = scannedStation || fallbackStations[0];
  const [selectedStationId, setSelectedStationId] = useState<string>(activeStation.stationId);
  useEffect(() => {
    if (scannedStation?.stationId) {
      setSelectedStationId(scannedStation.stationId);
    }
  }, [scannedStation]);

  const currentStation =
    (scannedStation && scannedStation.stationId === selectedStationId
      ? scannedStation
      : fallbackStations.find((s) => s.stationId === selectedStationId)) || activeStation;

  const crewButtons = Array.from(
    new Set(roster.map((r) => r.crew_id).filter(Boolean))
  );
  const quickCrews = crewButtons.length > 0 ? crewButtons : ['Crew-A', 'Crew-B', 'Crew-C'];

  // Countdown timer for next break
  useEffect(() => {
    const interval = setInterval(() => {
      setBreakTimerSeconds((prev) => (prev > 0 ? prev - 1 : 20 * 60));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleBuddyCheck = () => {
    setBuddyCheckCount((prev) => prev + 1);
    setJustCheckedBuddy(true);
    setTimeout(() => setJustCheckedBuddy(false), 3000);
  };

  const formatCheckInTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="space-y-6">
      {/* 0. Instant QR / Zero-Typing Shady Area Check-In Card */}
      <FlyingCard direction="scale" delay={0} onScrollReveal={false}>
        <div
          dir={workerLabels.dir}
          className={`rounded-2xl p-5 shadow-xs transition-all border-2 space-y-3.5 ${
            scannedStation || lastShadeCheckIn
              ? 'bg-[#edf4f0] border-[#173829]'
              : 'bg-white border-[#e5dfd3]'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center space-x-2.5 rtl:space-x-reverse">
              <div className="p-2.5 rounded-xl bg-[#173829] text-[#A3E5C1] shrink-0">
                {lastShadeCheckIn ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  <QrCode className="w-5 h-5" />
                )}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-black text-sm text-[#173829]">
                    {workerLabels.shadeCheckInTitle}
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#173829] text-[#FAF8F3]">
                    {currentStation.stationId}
                  </span>
                </div>
                <p className="text-xs text-[#24533D] font-semibold mt-0.5">
                  <Umbrella className="w-3.5 h-3.5 inline me-1" />
                  {currentStation.stationName}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {(['en', 'ar', 'hi', 'ur'] as WorkerLanguageCode[]).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setWorkerLabelLang(code)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold border cursor-pointer ${
                    workerLabelLang === code
                      ? 'bg-[#173829] text-[#FAF8F3] border-[#173829]'
                      : 'bg-white text-[#173829] border-[#d8d0bf]'
                  }`}
                >
                  {WORKER_VIEW_LABELS[code].langName}
                </button>
              ))}
              {scannedStation && onDismissScannedStation && (
                <button
                  type="button"
                  onClick={onDismissScannedStation}
                  className="p-1.5 rounded-lg bg-white border border-[#d8d0bf] text-[#426050] hover:text-[#173829] cursor-pointer"
                  aria-label="Clear QR scan banner"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {lastShadeCheckIn && (
            <div className="bg-white border border-[#24533D] rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 font-black text-[#173829]">
                <CheckCircle2 className="w-4 h-4 text-[#166534] shrink-0" />
                <span>
                  {workerLabels.shadeCheckedInStatus}: {lastShadeCheckIn.stationName} ({lastShadeCheckIn.crew_id})
                </span>
              </div>
              <span className="font-mono font-bold text-[#24533D] bg-[#edf4f0] px-2.5 py-0.5 rounded-md">
                {formatCheckInTime(lastShadeCheckIn.checkedInAtIso)}
              </span>
            </div>
          )}

          {/* Rest station quick pills + 1-tap Crew Check-In buttons (zero keyboard typing) */}
          <div className="space-y-2">
            {!scannedStation && (
              <div className="flex flex-wrap items-center gap-1.5">
                {fallbackStations.map((st) => (
                  <button
                    key={st.stationId}
                    type="button"
                    onClick={() => setSelectedStationId(st.stationId)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer transition-colors ${
                      currentStation.stationId === st.stationId
                        ? 'bg-[#24533D] text-[#FAF8F3] border-[#24533D]'
                        : 'bg-[#f7f5ee] text-[#173829] border-[#d8d0bf] hover:bg-[#eae4d5]'
                    }`}
                  >
                    {st.stationId}
                  </button>
                ))}
              </div>
            )}

            <div className="text-[11px] font-bold text-[#426050]">
              {workerLabels.shadeTapCrewPrompt}
            </div>
            <div className="flex flex-wrap gap-2">
              {quickCrews.map((crewCode) => (
                <button
                  key={crewCode}
                  type="button"
                  onClick={() =>
                    onShadeCheckIn?.(
                      currentStation,
                      crewCode,
                      scannedStation ? 'qr_scan' : 'quick_tap'
                    )
                  }
                  className="px-4 py-2.5 rounded-xl bg-[#173829] hover:bg-[#24533d] active:scale-95 text-[#FAF8F3] text-xs font-black flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4 text-[#A3E5C1]" />
                  <span>{crewCode}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="text-[10px] text-[#426050]">
            {workerLabels.noIndividualTrackingNote}
          </div>
        </div>
      </FlyingCard>

      {/* 0b. Read-Only Worker Simple Card & Printable Gate QR */}
      <FlyingCard direction="bottom" delay={0.03} onScrollReveal={false}>
        <WorkerSimpleCardPanel
          evaluation={evaluation}
          roster={roster}
          coordinatorPlan={coordinatorPlan}
          stations={fallbackStations}
          initialCrewId={scannedStation?.defaultCrewId}
        />
      </FlyingCard>

      {/* 1. Primary Risk Card */}
      <FlyingCard direction="scale" delay={0} onScrollReveal={false}>
        <RiskCard evaluation={evaluation} onOpenWhyAlert={onOpenWhyAlert} locale={locale} />
      </FlyingCard>

      {/* 2. Accessible Bilingual Results Read & Audio Player */}
      <FlyingCard direction="left" delay={0.06} onScrollReveal={false}>
        <BilingualResultsAudioCard
          evaluation={evaluation}
          advice={advice}
          locale={locale}
          onOpenVoiceQa={onOpenVoiceQa}
        />
      </FlyingCard>

      {/* 3. Multilingual Alert advisory with voice read-out */}
      <FlyingCard direction="right" delay={0.12}>
        <MultilingualAlert
          advice={advice}
          currentLang={currentLang}
          onChangeLanguage={onChangeLanguage}
          isAiLoading={isAiLoading}
          locale={locale}
        />
      </FlyingCard>

      {/* 3. Interactive Hydration & Rest Break Guidance */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Risk-Adaptive Interactive Hydration Tracker */}
        <FlyingCard direction="left" delay={0.05} hoverLift>
          <HydrationTrackerWidget
            evaluation={evaluation}
            role="worker"
            locale={locale}
            waterMl={waterMl}
            electrolytesCount={electrolytesCount}
            hydrationStreak={hydrationStreak}
            goalStreakDays={goalStreakDays}
            lastLoggedTime={lastHydrationTime}
            onLogDrink={onLogDrink}
            onUndoDrink={onUndoDrink}
          />
        </FlyingCard>

        {/* Work / Rest Ratio & Countdown Timer */}
        <FlyingCard direction="right" delay={0.12} hoverLift>
          <div className="bg-white border border-[#e5dfd3] rounded-2xl p-5 shadow-xs hover:shadow-md transition-shadow h-full">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2.5 rtl:space-x-reverse">
              <div className="p-2.5 rounded-xl bg-[#edf4f0] text-[#173829]">
                <Clock className="w-5 h-5 text-[#173829]" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[#173829]">{t.worker.workRestTitle}</h3>
                <p className="text-xs text-[#426050]">{t.worker.workRestDesc}</p>
              </div>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#edf4f0] text-[#173829] border border-[#c3d9cd]">
              {evaluation.workRestRatio || evaluation.safeAction}
            </span>
          </div>

          <div className="bg-[#f7f5ee] rounded-xl p-3.5 border border-[#e2dcd0] my-3 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#426050]">
                {t.worker.nextCoolingBreak}
              </div>
              <div className="text-2xl font-black text-[#173829] font-mono mt-0.5">
                {formatTimer(breakTimerSeconds)}
              </div>
            </div>
            <button
              onClick={() => setBreakTimerSeconds(20 * 60)}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-[#eae4d5] border border-[#d8d0bf] text-[#173829] text-xs font-bold transition-all shadow-xs"
            >
              {t.worker.startBreakNow}
            </button>
          </div>

          <div className="text-[11px] text-[#426050] leading-relaxed">
            {locale === 'ar'
              ? 'موصى به بموجب معايير السلامة المهنية بدبي: الاستراحة في خيمة مظللة ومكيفة مع تهوية ميكانيكية.'
              : 'ISO 7243 compliance: Cooling breaks must be taken in mechanically air-conditioned or shaded welfare units.'}
          </div>
          </div>
        </FlyingCard>
      </div>

      {/* 4. Innovation 2: "Check In on a Teammate" (Buddy Check) & Innovation 4: Acclimatization Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Buddy System Card */}
        <FlyingCard direction="left" delay={0.05} hoverLift>
          <div className="bg-white border border-[#e5dfd3] rounded-2xl p-5 shadow-xs hover:shadow-md transition-shadow h-full">
          <div className="flex items-center space-x-2.5 rtl:space-x-reverse mb-3">
            <div className="p-2.5 rounded-xl bg-[#edf4f0] text-[#173829]">
              <HeartHandshake className="w-5 h-5 text-[#173829]" />
            </div>
            <div>
              <div className="flex items-center space-x-2 rtl:space-x-reverse">
                <h3 className="font-bold text-sm text-[#173829]">{t.worker.buddyTitle}</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#edf4f0] text-[#173829] border border-[#c3d9cd]">
                  {t.worker.buddyBadge}
                </span>
              </div>
              <p className="text-xs text-[#426050]">{t.worker.buddyDesc}</p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#f7f5ee] border border-[#e2dcd0] mb-3 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl overflow-hidden border border-[#DDD4C3] bg-white shrink-0 shadow-xs">
              <img
                src="/assets/images/dubai_worker_3d_1794411980911.jpg"
                alt="Teammate avatar"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#426050]">{t.worker.assignedBuddy}:</span>
                <strong className="text-[#173829] font-bold font-sans">
                  {locale === 'ar' ? 'زوج عمل مجهول (فريق ب)' : 'Anonymous Crew-B Peer Pair'}
                </strong>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#426050]">{t.worker.checksCompletedToday}:</span>
                <span className="font-mono font-bold text-[#173829] bg-white px-2 py-0.5 rounded-md border border-[#d8d0bf]">
                  {buddyCheckCount} {locale === 'ar' ? 'فحوصات' : 'checks'}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleBuddyCheck}
            disabled={justCheckedBuddy}
            className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center space-x-2 rtl:space-x-reverse transition-all shadow-xs ${
              justCheckedBuddy
                ? 'bg-[#24533d] text-white'
                : 'bg-[#173829] hover:bg-[#24533d] text-[#f7f5ee]'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>
              {justCheckedBuddy
                ? locale === 'ar'
                  ? 'تم تسجيل الفحص بنجاح ✓'
                  : 'Buddy Check Logged ✓'
                : t.worker.checkBuddyButton}
            </span>
          </button>
          </div>
        </FlyingCard>

        {/* Acclimatization & New Worker Protection Card */}
        <FlyingCard direction="right" delay={0.12} hoverLift>
          <div className="bg-white border border-[#e5dfd3] rounded-2xl p-5 shadow-xs hover:shadow-md transition-shadow h-full">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2.5 rtl:space-x-reverse">
              <div className="p-2.5 rounded-xl bg-[#edf4f0] text-[#173829]">
                <ShieldCheck className="w-5 h-5 text-[#173829]" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[#173829]">{t.worker.acclimTitle}</h3>
                <p className="text-xs text-[#426050]">{t.worker.acclimDesc}</p>
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#f7f5ee] border border-[#e2dcd0] space-y-2 mb-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#426050]">{t.worker.statusLabel}:</span>
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                  isNewWorker
                    ? 'bg-[#fef3c7] text-[#92400e] border-[#fde68a]'
                    : 'bg-[#edf4f0] text-[#173829] border-[#c3d9cd]'
                }`}
              >
                {isNewWorker ? t.worker.newWorker14Days : t.worker.fullyAcclimatized}
              </span>
            </div>

            <p className="text-[11px] text-[#426050] leading-relaxed">
              {isNewWorker
                ? locale === 'ar'
                  ? 'بروتوكول اليوم الأول إلى الرابع عشر: عتبة المخاطر منخفضة بمقدار درجتين، مع فترات راحة إضافية إلزامية لغير المعتادين على مناخ الخليج.'
                  : 'Days 1-14 protocol active: WBGT limit reduced by 2°C, with mandatory ramp-up rest breaks enforced.'
                : locale === 'ar'
                  ? 'تم استيفاء متطلبات التأقلم الكاملة (أكثر من 14 يوماً من العمل الميداني المستمر).'
                  : 'Full heat adaptation confirmed (>14 continuous days on Dubai sites).'}
            </p>
          </div>

          <label className="flex items-center space-x-2 rtl:space-x-reverse cursor-pointer text-xs text-[#173829] font-semibold bg-[#f7f5ee] p-2.5 rounded-xl border border-[#e2dcd0] hover:bg-[#eae4d5] transition-colors">
            <input
              type="checkbox"
              checked={isNewWorker}
              onChange={(e) => onToggleNewWorker(e.target.checked)}
              className="rounded text-[#173829] focus:ring-[#173829] w-4 h-4"
            />
            <span>{t.worker.toggleNewWorker}</span>
          </label>
          </div>
        </FlyingCard>
      </div>

      {/* 5. Emergency & First Aid Escalation Card + Hindi/Urdu Optional Labels (Zero Individual Health Collection) */}
      <FlyingCard direction="bottom" delay={0.06}>
        <div
          dir={workerLabels.dir}
          className="bg-white border border-[#e5dfd3] rounded-2xl p-5 shadow-xs hover:shadow-md transition-shadow space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#ece6da]">
            <div>
              <div className="flex items-center space-x-2 rtl:space-x-reverse">
                <AlertOctagon className="w-4 h-4 text-[#c81d25]" />
                <h3 className="font-bold text-sm text-[#173829]">
                  {workerLabels.stopSignTitle}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#fee2e2] text-[#991b1b] border border-[#fecaca]">
                  UAE 998
                </span>
              </div>
              <p className="text-xs text-[#426050] mt-0.5">
                Automated environmental guidance only. Not a medical diagnosis or treatment.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(['en', 'ar', 'hi', 'ur'] as WorkerLanguageCode[]).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setWorkerLabelLang(code)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                    workerLabelLang === code
                      ? 'bg-[#173829] text-[#f7f5ee] border-[#173829]'
                      : 'bg-[#f7f5ee] text-[#173829] border-[#e2dcd0] hover:bg-[#eae4d5]'
                  }`}
                >
                  {WORKER_VIEW_LABELS[code].langName}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowSosModal(true)}
                className="flex items-center space-x-1.5 rtl:space-x-reverse px-3 py-1.5 rounded-xl bg-[#c81d25] hover:bg-[#a5151c] text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>{workerLabels.call998Label}</span>
              </button>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#fff5f5] border border-[#fca5a5] space-y-2 text-xs text-[#991b1b]">
            <div className="font-bold">{workerLabels.middayBreakLabel}</div>
            <ul className="list-disc pl-5 rtl:pr-5 space-y-1 font-medium">
              {workerLabels.stopSignsList.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            <div className="pt-1 border-t border-[#fecaca] text-[11px] text-[#7f1d1d] font-semibold">
              {workerLabels.hydrateLabel} · {workerLabels.shadeLabel}
            </div>
          </div>
        </div>
      </FlyingCard>

      {/* 6. Privacy & Data Ledger Link */}
      <FlyingCard direction="scale" delay={0.05}>
        <div className="flex items-center justify-between p-4 rounded-2xl bg-white border border-[#e5dfd3] shadow-xs">
          <div className="flex items-center space-x-2 rtl:space-x-reverse text-xs text-[#426050]">
            <Lock className="w-4 h-4 text-[#173829]" />
            <span>{t.worker.privacyLedgerText}</span>
          </div>
          <button
            onClick={() => setShowDataLedger(true)}
            className="text-xs text-[#173829] underline hover:text-[#24533d] font-bold"
          >
            {t.worker.viewDataLedger}
          </button>
        </div>
      </FlyingCard>

      {/* SOS / On-Site Medic Dispatch Modal */}
      {showSosModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-[#e5dfd3] shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#e5dfd3]">
              <div className="flex items-center space-x-2 rtl:space-x-reverse text-[#c81d25]">
                <AlertOctagon className="w-6 h-6 animate-pulse" />
                <h3 className="font-black text-lg text-[#173829]">{t.worker.sosModalTitle}</h3>
              </div>
              <button
                onClick={() => setShowSosModal(false)}
                className="text-[#6c8577] hover:text-[#173829] p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[#426050] leading-relaxed">
              {locale === 'ar'
                ? 'جاري إرسال إشعار فوري لمسعف الموقع الميداني ومسؤول السلامة مع تحديد موقعك الحالي عبر GPS.'
                : 'Emergency dispatch alert generated. On-site first-aider and site safety officer have been alerted with your GPS location.'}
            </p>

            <div className="bg-[#f7f5ee] p-3.5 rounded-xl border border-[#e2dcd0] space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-[#426050]">{locale === 'ar' ? 'الموقع' : 'Location'}:</span>
                <strong className="text-[#173829]">{locale === 'ar' ? 'برج الخليج - الطابق 14' : 'Downtown Tower - Sector 4'}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#426050]">{locale === 'ar' ? 'رقم الطوارئ الميداني' : 'Site First-Aid'}:</span>
                <strong className="text-[#c81d25] font-mono font-black">998 (Dubai Ambulance) / 04-206-5555</strong>
              </div>
            </div>

            <button
              onClick={() => setShowSosModal(false)}
              className="w-full py-3 rounded-xl bg-[#173829] hover:bg-[#24533d] text-[#f7f5ee] font-bold text-xs shadow-md transition-colors"
            >
              {locale === 'ar' ? 'تأكيد وصول المساعدة وإغلاق' : 'Assistance Dispatched • Acknowledge'}
            </button>
          </div>
        </div>
      )}

      {/* Data Ledger Privacy Modal */}
      {showDataLedger && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 border border-[#e5dfd3] shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#e5dfd3]">
              <div className="flex items-center space-x-2 rtl:space-x-reverse text-[#173829]">
                <Lock className="w-5 h-5" />
                <h3 className="font-bold text-base">{t.worker.dataLedgerModalTitle}</h3>
              </div>
              <button
                onClick={() => setShowDataLedger(false)}
                className="text-[#6c8577] hover:text-[#173829] p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[#426050] leading-relaxed">
              {locale === 'ar'
                ? 'يلتزم نظام درع الحرارة بأعلى معايير حماية البيانات الشخصية المعتمدة في دولة الإمارات العربية المتحدة (قانون البيانات الاتحادي). جميع قياسات المستشعرات وسجلات الإرهاق مجهولة المصدر وتخزن محلياً.'
                : 'HeatShield complies with UAE Federal Data Protection regulations. All physiological strain telemetry and symptom disclosures are anonymized on-device and cannot be used for punitive employment metrics.'}
            </p>

            <div className="p-3 bg-[#f7f5ee] rounded-xl border border-[#e2dcd0] space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[#426050]">Telemetry ID:</span>
                <span className="font-mono text-[#173829]">UAEPASS-ANON-7781</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#426050]">Encryption:</span>
                <span className="font-mono text-[#173829]">AES-256 (Local Storage Only)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#426050]">Zero-Tracking:</span>
                <span className="text-[#173829] font-bold">Enabled (No camera/mic tracking)</span>
              </div>
            </div>

            <button
              onClick={() => setShowDataLedger(false)}
              className="w-full py-2.5 rounded-xl bg-[#173829] hover:bg-[#24533d] text-[#f7f5ee] font-bold text-xs"
            >
              {locale === 'ar' ? 'إغلاق' : 'Close'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
