import React, { useMemo, useState } from 'react';
import {
  CheckSquare,
  Droplets,
  Flame,
  Sliders,
  AlertOctagon,
  Building2,
  ClipboardCheck,
  Printer,
  Copy,
  Check,
  Volume2,
  Sparkles,
  PlusCircle,
  Lock,
  ShieldCheck,
  BarChart3,
  History,
  X,
} from 'lucide-react';
import {
  ComplianceConfig,
  ExposureType,
  WorkloadIntensity,
  WorkZoneType,
} from '../../config/complianceConfig';
import {
  AcclimatizationStatusTag,
  AnonymousIncidentRecord,
  AuditGovernanceEntry,
  CrewAcclimatizationPlan,
  CrewRosterRow,
  CrewZoneAssignment,
  EnvWeatherState,
  HydrationAlertAuditRecord,
  SchedulePlanResult,
  SiteReadinessChecklistState,
} from '../../types/occupational';
import { AppLocale } from '../../utils/i18n';
import {
  analyzeIncidentPatterns,
  buildHydrationReminderPayload,
  buildMultiSitePortfolio,
  computeJudgeImpactMetrics,
  evaluateZoneAndPpeContext,
  runWhatIfSimulation,
} from '../../services/coordinatorEngines';

export type HseSuiteTab =
  | 'readiness'
  | 'hydration'
  | 'acclim'
  | 'whatif'
  | 'incidents'
  | 'portfolio';

interface HSEOperationsSuiteProps {
  locale: AppLocale;
  weather: EnvWeatherState;
  roster: CrewRosterRow[];
  plan: SchedulePlanResult;
  config: ComplianceConfig;
  forceMiddaySeason: boolean;
  // Readiness Checklist (#2)
  checklist: SiteReadinessChecklistState;
  onToggleChecklistItem: (itemId: string) => void;
  onUpdateChecklistNote: (itemId: string, note: string) => void;
  // Hydration Alerts (#3)
  hydrationAlerts: HydrationAlertAuditRecord[];
  onPushHydrationAlert: (
    payload: Omit<HydrationAlertAuditRecord, 'id' | 'sentAtIso' | 'status'>,
    channel: 'banner' | 'voice' | 'whatsapp'
  ) => void;
  onAcknowledgeHydrationAlert: (alertId: string) => void;
  // Acclimatization (#1) & Zone Context (#5)
  acclimatizationTags: Record<string, AcclimatizationStatusTag>;
  acclimatizationPlans: Record<string, CrewAcclimatizationPlan>;
  onChangeAcclimatizationTag: (crewId: string, tag: AcclimatizationStatusTag) => void;
  onGenerateAcclimatizationPlan: (crewId: string) => void;
  isGeneratingAcclim: boolean;
  zoneAssignments: Record<string, CrewZoneAssignment>;
  onUpdateZoneAssignment: (crewId: string, updated: CrewZoneAssignment) => void;
  // Incidents (#7)
  incidents: AnonymousIncidentRecord[];
  onLogIncident: (inc: Omit<AnonymousIncidentRecord, 'id'>) => void;
  // Governance Audit (#11)
  auditLog: AuditGovernanceEntry[];
  // Quick Approve helper (#11)
  onApprovePlan: () => void;
}

export const HSEOperationsSuite: React.FC<HSEOperationsSuiteProps> = ({
  locale,
  weather,
  roster,
  plan,
  config,
  forceMiddaySeason,
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
  onApprovePlan,
}) => {
  const isAr = locale === 'ar';
  const [activeTab, setActiveTab] = useState<HseSuiteTab>('readiness');
  const [showComplianceReportModal, setShowComplianceReportModal] = useState(false);

  // Hydration Engine UI state
  const [hydrationCrewId, setHydrationCrewId] = useState<string>(roster[0]?.crew_id || 'Crew-A');
  const [hydrationLangPreview, setHydrationLangPreview] = useState<'en' | 'ar' | 'hi' | 'ur'>('en');
  const [copiedAlertText, setCopiedAlertText] = useState(false);
  const [approvalGateNotice, setApprovalGateNotice] = useState(false);

  // Acclimatization & Zone active crew
  const [selectedCrewId, setSelectedCrewId] = useState<string>(roster[0]?.crew_id || 'Crew-A');

  // What-If Simulator UI state (#6)
  const [simTemp, setSimTemp] = useState<number>(Math.round(weather.current.airTempC));
  const [simHumidity, setSimHumidity] = useState<number>(Math.round(weather.current.relativeHumidityPct));
  const [simHour, setSimHour] = useState<number>(13);
  const [simWorkload, setSimWorkload] = useState<WorkloadIntensity>('heavy');
  const [simRestMins, setSimRestMins] = useState<number>(30);
  const [simExposure, setSimExposure] = useState<ExposureType>('sun');
  const [simZone, setSimZone] = useState<WorkZoneType>('rooftop');
  const [simDarkPpe, setSimDarkPpe] = useState<boolean>(false);
  const [simReflective, setSimReflective] = useState<boolean>(false);
  const [simAiTradeoff, setSimAiTradeoff] = useState<string>('');
  const [isLoadingSimAi, setIsLoadingSimAi] = useState<boolean>(false);

  // Incident form state (#7 — zero personal fields)
  const [incZone, setIncZone] = useState<string>('Zone B (Rooftop)');
  const [incHour, setIncHour] = useState<number>(14);
  const [incAction, setIncAction] = useState<string>('Stopped open-sun task & moved crew to AC shelter');
  const [incNotes, setIncNotes] = useState<string>('');

  const crewIds = useMemo(() => {
    const list = Array.from(new Set(roster.map((r) => r.crew_id).filter(Boolean)));
    return list.length > 0 ? list : ['Crew-A', 'Crew-B', 'Crew-C'];
  }, [roster]);

  const selectedCrewRow =
    roster.find((r) => r.crew_id === selectedCrewId) || {
      crew_id: selectedCrewId,
      taskType: 'General Site Work',
      workload: 'moderate' as WorkloadIntensity,
      exposure: 'sun' as ExposureType,
      shiftStart: '06:00',
      shiftEnd: '17:00',
    };

  const hydrationCrewRow =
    roster.find((r) => r.crew_id === hydrationCrewId) || selectedCrewRow;

  const hydrationDraft = useMemo(
    () =>
      buildHydrationReminderPayload(
        hydrationCrewRow.crew_id,
        hydrationCrewRow.workload,
        weather.current.wbgtEstimatedC,
        config
      ),
    [hydrationCrewRow, weather.current.wbgtEstimatedC, config]
  );

  const selectedZoneAssign: CrewZoneAssignment = zoneAssignments[selectedCrewId] || {
    crew_id: selectedCrewId,
    zoneType: 'open_ground',
    darkPpe: false,
    reflectiveSurfaces: false,
  };

  const zoneContextEval = useMemo(
    () =>
      evaluateZoneAndPpeContext(
        selectedZoneAssign,
        selectedCrewRow.workload,
        weather.current.hourIndex,
        weather.current.wbgtEstimatedC,
        config
      ),
    [selectedZoneAssign, selectedCrewRow.workload, weather.current, config]
  );

  const simResult = useMemo(
    () =>
      runWhatIfSimulation(
        {
          airTempC: simTemp,
          humidityPct: simHumidity,
          shiftStartHour: simHour,
          workload: simWorkload,
          restMinutesPerHour: simRestMins,
          exposure: simExposure,
          zoneType: simZone,
          darkPpe: simDarkPpe,
          reflectiveSurfaces: simReflective,
          forceMiddaySeason,
        },
        config
      ),
    [
      simTemp,
      simHumidity,
      simHour,
      simWorkload,
      simRestMins,
      simExposure,
      simZone,
      simDarkPpe,
      simReflective,
      forceMiddaySeason,
      config,
    ]
  );

  const incidentPatterns = useMemo(() => analyzeIncidentPatterns(incidents), [incidents]);
  const portfolioRows = useMemo(
    () =>
      buildMultiSitePortfolio(
        weather,
        plan.overallComplianceStatus,
        checklist.completionPercent,
        config,
        forceMiddaySeason
      ),
    [weather, plan.overallComplianceStatus, checklist.completionPercent, config, forceMiddaySeason]
  );
  const judgeMetrics = useMemo(
    () => computeJudgeImpactMetrics(plan, roster, checklist, hydrationAlerts, auditLog),
    [plan, roster, checklist, hydrationAlerts, auditLog]
  );

  const handleExplainWhatIfWithAi = async () => {
    setIsLoadingSimAi(true);
    try {
      const res = await fetch('/api/gemini/whatif-tradeoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          airTempC: simTemp,
          humidityPct: simHumidity,
          shiftStartHour: simHour,
          workload: simWorkload,
          restMinutesPerHour: simRestMins,
          zoneType: simZone,
          effectiveWbgtC: simResult.effectiveWbgtC,
          complianceStatus: simResult.complianceStatus,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.tradeoffExplanation) {
          setSimAiTradeoff(data.tradeoffExplanation);
          return;
        }
      }
      setSimAiTradeoff(
        `At ${simTemp}°C / ${simHumidity}% RH in ${simZone} (${simResult.effectiveWbgtC.toFixed(1)}°C effective est. WBGT), compliance status is ${simResult.complianceStatus}. Increasing rest to ${Math.max(30, simRestMins)} min/hr or shifting work before 10:30 reduces peak heat stress while preserving safe output.`
      );
    } catch {
      setSimAiTradeoff(
        `Simulated ${simResult.complianceStatus} outcome at ${simResult.effectiveWbgtC.toFixed(1)}°C effective est. WBGT. Shift heavy work before 10:30 or increase shaded cooling recovery.`
      );
    } finally {
      setIsLoadingSimAi(false);
    }
  };

  const handleGatedPushAlert = async (channel: 'banner' | 'voice' | 'whatsapp') => {
    if (!plan.approved) {
      setApprovalGateNotice(true);
      return;
    }
    setApprovalGateNotice(false);
    if (channel === 'whatsapp') {
      try {
        await navigator.clipboard.writeText(hydrationDraft.messages[hydrationLangPreview]);
        setCopiedAlertText(true);
        setTimeout(() => setCopiedAlertText(false), 2000);
      } catch {
        // ignore clipboard failure
      }
    }
    if (channel === 'voice' && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(hydrationDraft.messages[hydrationLangPreview]);
        utter.lang = hydrationLangPreview === 'ar' ? 'ar-AE' : 'en-US';
        window.speechSynthesis.speak(utter);
      } catch {
        // ignore speech failure
      }
    }
    onPushHydrationAlert(hydrationDraft, channel);
  };

  const tabs: Array<{ id: HseSuiteTab; label: string; labelAr: string; icon: React.ReactNode }> = [
    {
      id: 'readiness',
      label: `Readiness (${checklist.completionPercent}%)`,
      labelAr: `الجاهزية (${checklist.completionPercent}%)`,
      icon: <CheckSquare className="w-3.5 h-3.5" />,
    },
    {
      id: 'hydration',
      label: 'Hydration & Alerts',
      labelAr: 'الترطيب والتنبيهات',
      icon: <Droplets className="w-3.5 h-3.5" />,
    },
    {
      id: 'acclim',
      label: 'Acclimatization & Zones',
      labelAr: 'التأقلم والمناطق',
      icon: <Flame className="w-3.5 h-3.5" />,
    },
    {
      id: 'whatif',
      label: 'What-If Simulator',
      labelAr: 'محاكي التوقعات',
      icon: <Sliders className="w-3.5 h-3.5" />,
    },
    {
      id: 'incidents',
      label: `Incident Log (${incidents.length})`,
      labelAr: `سجل الحوادث (${incidents.length})`,
      icon: <AlertOctagon className="w-3.5 h-3.5" />,
    },
    {
      id: 'portfolio',
      label: 'Portfolio, Audit & Impact',
      labelAr: 'المواقع والتدقيق والأثر',
      icon: <Building2 className="w-3.5 h-3.5" />,
    },
  ];

  return (
    <section className="bg-white border border-[#e5dfd3] rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
      {/* Suite Header & Navigation Tabs */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-[#ece6da]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-[#173829]" />
            <h2 className="text-base sm:text-lg font-black text-[#173829]">
              {isAr
                ? 'منظومة عمليات السلامة المهنية والامتثال (HSE)'
                : 'UAE HSE Operations, Simulation & Governance Suite'}
            </h2>
          </div>
          <p className="text-xs text-[#426050] mt-0.5">
            Automated environmental guidance only. Not a medical diagnosis or treatment. Crew-level & site-level only.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5 print:hidden">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-[#173829] text-[#FAF8F3] border-[#173829] shadow-xs'
                  : 'bg-[#f7f5ee] text-[#173829] border-[#e2dcd0] hover:bg-[#edf4f0]'
              }`}
            >
              {tab.icon}
              <span>{isAr ? tab.labelAr : tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: SITE READINESS CHECKLIST & DAILY COMPLIANCE PDF (#2) */}
      {activeTab === 'readiness' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#f7f5ee] border border-[#e2dcd0] rounded-xl p-4">
            <div>
              <div className="text-sm font-black text-[#173829]">
                {isAr ? 'قائمة التحقق اليومية لجاهزية الموقع' : 'Daily Pre-Shift Site Readiness Checklist'}
              </div>
              <div className="text-xs text-[#426050]">
                Completion directly feeds the Site Compliance Status panel · Zero personal data.
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-[10px] font-bold uppercase text-[#426050]">Readiness Score</div>
                <div className="text-xl font-black font-mono text-[#173829]">
                  {checklist.completionPercent}%
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowComplianceReportModal(true)}
                className="px-4 py-2 rounded-xl bg-[#173829] hover:bg-[#24533d] text-[#FAF8F3] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>{isAr ? 'تقرير الامتثال اليومي PDF' : 'Daily Compliance Report (PDF)'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {checklist.items.map((item) => (
              <div
                key={item.id}
                className={`p-3.5 rounded-xl border transition-colors space-y-2 ${
                  item.checked
                    ? 'bg-[#edf4f0]/60 border-[#c3d9cd]'
                    : 'bg-[#FFF5F5] border-[#FECACA]'
                }`}
              >
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={() => onToggleChecklistItem(item.id)}
                    className="mt-0.5 w-4 h-4 rounded accent-[#173829]"
                  />
                  <span className="text-xs font-bold text-[#173829]">
                    {isAr ? item.labelAr : item.label}
                  </span>
                  <span
                    className={`ms-auto px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                      item.checked
                        ? 'bg-[#DCFCE7] text-[#166534]'
                        : 'bg-[#FEE2E2] text-[#991B1B]'
                    }`}
                  >
                    {item.checked ? 'YES' : 'NO'}
                  </span>
                </label>

                <input
                  type="text"
                  value={item.note}
                  onChange={(e) => onUpdateChecklistNote(item.id, e.target.value)}
                  placeholder="Optional site/station verification note (no names)..."
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-[#d8d0bf] text-[11px] text-[#173829]"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: HYDRATION & REST-BREAK REMINDER ENGINE (#3 + #11 GATE) */}
      {activeTab === 'hydration' && (
        <div className="space-y-4">
          {/* Governance Gate Banner */}
          {!plan.approved && (
            <div className="bg-[#FEF3C7] border border-[#F59E0B] rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[#92400E]">
              <div className="flex items-center gap-2 font-bold">
                <Lock className="w-4 h-4 shrink-0" />
                <span>
                  Human coordinator approval is mandatory before sending schedule or hydration alerts.
                </span>
              </div>
              <button
                type="button"
                onClick={onApprovePlan}
                className="px-3 py-1.5 rounded-lg bg-[#173829] text-[#FAF8F3] font-bold text-xs cursor-pointer shrink-0"
              >
                Approve Schedule Now
              </button>
            </div>
          )}

          {approvalGateNotice && !plan.approved && (
            <div className="bg-[#FEE2E2] border border-[#FCA5A5] rounded-xl p-3 text-xs font-bold text-[#991B1B]">
              Blocked by Governance Gate (#11): Click "Approve Schedule" above before pushing alerts to crews.
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-6 bg-[#f7f5ee] border border-[#e2dcd0] rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-black text-[#173829]">
                  Auto-Generated Crew Hydration Prompt
                </h3>
                <select
                  value={hydrationCrewId}
                  onChange={(e) => setHydrationCrewId(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-white border border-[#d8d0bf] text-xs font-bold text-[#173829]"
                >
                  {crewIds.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center font-mono text-xs">
                <div className="bg-white border border-[#e5dfd3] rounded-lg p-2">
                  <div className="font-sans text-[10px] text-[#426050]">Cadence</div>
                  <strong className="text-[#173829]">Every {hydrationDraft.intervalMinutes}m</strong>
                </div>
                <div className="bg-white border border-[#e5dfd3] rounded-lg p-2">
                  <div className="font-sans text-[10px] text-[#426050]">Volume</div>
                  <strong className="text-[#173829]">{hydrationDraft.mlPerBreak} ml</strong>
                </div>
                <div className="bg-white border border-[#e5dfd3] rounded-lg p-2">
                  <div className="font-sans text-[10px] text-[#426050]">Risk Band</div>
                  <strong className="text-[#173829]">{hydrationDraft.actionLevel}</strong>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {(['en', 'ar', 'hi', 'ur'] as const).map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setHydrationLangPreview(code)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${
                      hydrationLangPreview === code
                        ? 'bg-[#173829] text-[#FAF8F3] border-[#173829]'
                        : 'bg-white text-[#173829] border-[#d8d0bf]'
                    }`}
                  >
                    {code.toUpperCase()}
                  </button>
                ))}
              </div>

              <div
                dir={hydrationLangPreview === 'ar' || hydrationLangPreview === 'ur' ? 'rtl' : 'ltr'}
                className="bg-white border border-[#d8d0bf] rounded-xl p-3 text-xs font-semibold text-[#173829] leading-relaxed"
              >
                {hydrationDraft.messages[hydrationLangPreview]}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleGatedPushAlert('banner')}
                  className="px-3 py-2 rounded-xl bg-[#173829] hover:bg-[#24533d] text-[#FAF8F3] text-xs font-bold cursor-pointer"
                >
                  Push Crew Banner Alert
                </button>
                <button
                  type="button"
                  onClick={() => void handleGatedPushAlert('voice')}
                  className="px-3 py-2 rounded-xl bg-[#edf4f0] hover:bg-[#dcebe2] border border-[#c3d9cd] text-[#173829] text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Voice Broadcast</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleGatedPushAlert('whatsapp')}
                  className="px-3 py-2 rounded-xl bg-white hover:bg-[#FAF8F3] border border-[#d8d0bf] text-[#173829] text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  {copiedAlertText ? <Check className="w-3.5 h-3.5 text-[#166534]" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedAlertText ? 'Copied WhatsApp/SMS' : 'Copy WhatsApp/SMS'}</span>
                </button>
              </div>
            </div>

            <div className="lg:col-span-6 bg-[#f7f5ee] border border-[#e2dcd0] rounded-xl p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-[#173829]">
                  Crew Alert Sent / Acknowledged Audit Log
                </h3>
                <span className="font-mono text-[11px] text-[#426050]">
                  {hydrationAlerts.length} logged
                </span>
              </div>

              {hydrationAlerts.length === 0 ? (
                <div className="bg-white border border-[#e5dfd3] rounded-xl p-4 text-xs text-[#426050]">
                  Approve schedule and push a hydration alert on the left to record crew-level delivery and acknowledgment.
                </div>
              ) : (
                <ul className="space-y-2 max-h-64 overflow-y-auto">
                  {hydrationAlerts.map((alert) => (
                    <li
                      key={alert.id}
                      className="bg-white border border-[#e5dfd3] rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <span className="font-mono font-bold text-[#173829]">{alert.crew_id}</span> ·{' '}
                        <span className="text-[#426050]">
                          {alert.channel} · Every {alert.intervalMinutes}m ({alert.mlPerBreak}ml)
                        </span>
                        <div className="text-[10px] font-mono text-[#557564]">
                          Sent {new Date(alert.sentAtIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {alert.acknowledgedAtIso
                            ? ` · Ack ${new Date(alert.acknowledgedAtIso).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}`
                            : ''}
                        </div>
                      </div>

                      {alert.status === 'acknowledged' ? (
                        <span className="px-2.5 py-1 rounded-lg bg-[#DCFCE7] text-[#166534] font-bold text-[11px]">
                          Acknowledged ✓
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onAcknowledgeHydrationAlert(alert.id)}
                          className="px-2.5 py-1 rounded-lg bg-[#173829] text-[#FAF8F3] font-bold text-[11px] cursor-pointer"
                        >
                          Acknowledge
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ACCLIMATIZATION PLANNER (#1) & EQUIPMENT / WORK-ZONE CONTEXT (#5) */}
      {activeTab === 'acclim' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 bg-[#f7f5ee] border border-[#e2dcd0] rounded-xl p-3">
            <span className="text-xs font-bold text-[#173829]">Select Crew Code:</span>
            {crewIds.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setSelectedCrewId(c)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                  selectedCrewId === c
                    ? 'bg-[#173829] text-[#FAF8F3] border-[#173829]'
                    : 'bg-white text-[#173829] border-[#d8d0bf]'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Acclimatization Planner (#1) */}
            <div className="lg:col-span-6 bg-[#f7f5ee] border border-[#e2dcd0] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-black text-[#173829]">
                  Crew Acclimatization Ramp Planner ({selectedCrewId})
                </h3>
                <span className="px-2 py-0.5 rounded bg-white border border-[#d8d0bf] text-[10px] font-bold text-[#426050]">
                  Crew Tag Only
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { id: 'new_to_site', label: 'New to Site' },
                    { id: 'returning_after_leave', label: 'Returning After Leave' },
                    { id: 'acclimatized', label: 'Acclimatized' },
                  ] as const
                ).map((opt) => {
                  const activeTag = acclimatizationTags[selectedCrewId] || 'acclimatized';
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onChangeAcclimatizationTag(selectedCrewId, opt.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${
                        activeTag === opt.id
                          ? 'bg-[#173829] text-[#FAF8F3] border-[#173829]'
                          : 'bg-white text-[#173829] border-[#d8d0bf]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => onGenerateAcclimatizationPlan(selectedCrewId)}
                disabled={isGeneratingAcclim}
                className="px-3.5 py-2 rounded-xl bg-[#173829] hover:bg-[#24533d] text-[#FAF8F3] text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#A3E5C1]" />
                <span>
                  {isGeneratingAcclim
                    ? 'Generating Ramp Guidance...'
                    : 'Generate Multi-Day Acclimatization Plan (Gemini)'}
                </span>
              </button>

              {acclimatizationPlans[selectedCrewId] && (
                <div className="bg-white border border-[#d8d0bf] rounded-xl p-3 space-y-2 text-xs">
                  <div className="font-bold text-[#173829]">
                    {acclimatizationPlans[selectedCrewId].summary}
                  </div>
                  <div className="space-y-1.5">
                    {acclimatizationPlans[selectedCrewId].days.map((d) => (
                      <div
                        key={d.day}
                        className="p-2 rounded-lg bg-[#FAF8F3] border border-[#e5dfd3] flex flex-col gap-0.5"
                      >
                        <div className="flex items-center justify-between font-bold text-[#173829]">
                          <span>
                            Day {d.day} · Max Exposure {d.maxExposurePct}%
                          </span>
                          <span className="uppercase text-[10px] font-mono bg-[#edf4f0] px-2 py-0.5 rounded">
                            {d.recommendedWorkload}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#426050]">{d.workRestNote}</div>
                      </div>
                    ))}
                  </div>
                  <div className="text-[11px] font-bold text-[#92400E] bg-[#FEF3C7] border border-[#FDE68A] rounded-lg px-2.5 py-1.5">
                    General guidance, verify with your HSE officer.
                  </div>
                </div>
              )}
            </div>

            {/* Equipment & Work-Zone Context (#5) */}
            <div className="lg:col-span-6 bg-[#f7f5ee] border border-[#e2dcd0] rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-black text-[#173829]">
                Equipment & Work-Zone Heat Load ({selectedCrewId})
              </h3>

              <div>
                <label className="block text-[11px] font-bold text-[#426050] mb-1">
                  Zone Microclimate Context (from Config)
                </label>
                <select
                  value={selectedZoneAssign.zoneType}
                  onChange={(e) =>
                    onUpdateZoneAssignment(selectedCrewId, {
                      ...selectedZoneAssign,
                      zoneType: e.target.value as WorkZoneType,
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#d8d0bf] text-xs font-bold text-[#173829]"
                >
                  {(Object.keys(config.workZoneModifiers) as WorkZoneType[]).map((zKey) => {
                    const mod = config.workZoneModifiers[zKey];
                    return (
                      <option key={zKey} value={zKey}>
                        {mod.label} ({mod.wbgtOffsetC >= 0 ? `+${mod.wbgtOffsetC}` : mod.wbgtOffsetC}°C est. WBGT)
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="flex flex-wrap gap-3">
                <label className="flex items-center gap-2 text-xs font-bold text-[#173829] bg-white px-3 py-2 rounded-xl border border-[#d8d0bf] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedZoneAssign.darkPpe}
                    onChange={(e) =>
                      onUpdateZoneAssignment(selectedCrewId, {
                        ...selectedZoneAssign,
                        darkPpe: e.target.checked,
                      })
                    }
                    className="rounded accent-[#173829]"
                  />
                  <span>Dark PPE (+{config.ppeModifiers.darkPpeOffsetC}°C heat load factor)</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-bold text-[#173829] bg-white px-3 py-2 rounded-xl border border-[#d8d0bf] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedZoneAssign.reflectiveSurfaces}
                    onChange={(e) =>
                      onUpdateZoneAssignment(selectedCrewId, {
                        ...selectedZoneAssign,
                        reflectiveSurfaces: e.target.checked,
                      })
                    }
                    className="rounded accent-[#173829]"
                  />
                  <span>Reflective Surfaces (+{config.ppeModifiers.reflectiveSurfacesOffsetC}°C heat load)</span>
                </label>
              </div>

              <div className="bg-white border border-[#d8d0bf] rounded-xl p-3 space-y-2 text-xs">
                <div className="font-mono text-[11px] font-bold text-[#173829]">
                  {zoneContextEval.transparentFormulaNote}
                </div>
                {zoneContextEval.flags.length > 0 ? (
                  <div className="bg-[#FEE2E2] border border-[#FCA5A5] text-[#991B1B] rounded-lg p-2.5 space-y-1">
                    {zoneContextEval.flags.map((f, idx) => (
                      <div key={idx} className="font-bold">
                        ⚠ {f}
                      </div>
                    ))}
                    {zoneContextEval.alternatives.map((alt, idx) => (
                      <div key={idx} className="text-[11px]">
                        Suggested alternative: {alt}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-[#166534] font-semibold">
                    No hazardous zone/workload combination flagged for the current hour.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: WHAT-IF SIMULATOR (#6) */}
      {activeTab === 'whatif' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-6 bg-[#f7f5ee] border border-[#e2dcd0] rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-black text-[#173829]">
              Pre-Approval What-If Schedule Simulator
            </h3>

            <div className="space-y-2.5 text-xs">
              <div>
                <div className="flex justify-between font-bold text-[#173829]">
                  <span>Air Temperature</span>
                  <span className="font-mono">{simTemp}°C</span>
                </div>
                <input
                  type="range"
                  min={28}
                  max={50}
                  value={simTemp}
                  onChange={(e) => setSimTemp(Number(e.target.value))}
                  className="w-full accent-[#173829]"
                />
              </div>

              <div>
                <div className="flex justify-between font-bold text-[#173829]">
                  <span>Relative Humidity</span>
                  <span className="font-mono">{simHumidity}%</span>
                </div>
                <input
                  type="range"
                  min={15}
                  max={90}
                  value={simHumidity}
                  onChange={(e) => setSimHumidity(Number(e.target.value))}
                  className="w-full accent-[#173829]"
                />
              </div>

              <div>
                <div className="flex justify-between font-bold text-[#173829]">
                  <span>Shift Block Hour</span>
                  <span className="font-mono">{String(simHour).padStart(2, '0')}:00</span>
                </div>
                <input
                  type="range"
                  min={6}
                  max={18}
                  value={simHour}
                  onChange={(e) => setSimHour(Number(e.target.value))}
                  className="w-full accent-[#173829]"
                />
              </div>

              <div>
                <div className="flex justify-between font-bold text-[#173829]">
                  <span>Rest Minutes / Hour</span>
                  <span className="font-mono">{simRestMins} min rest / {60 - simRestMins} min work</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={60}
                  step={15}
                  value={simRestMins}
                  onChange={(e) => setSimRestMins(Number(e.target.value))}
                  className="w-full accent-[#173829]"
                />
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <select
                  value={simWorkload}
                  onChange={(e) => setSimWorkload(e.target.value as WorkloadIntensity)}
                  className="px-2 py-1.5 rounded-lg bg-white border border-[#d8d0bf] text-xs font-bold text-[#173829]"
                >
                  <option value="light">Light Workload</option>
                  <option value="moderate">Moderate Workload</option>
                  <option value="heavy">Heavy Workload</option>
                </select>

                <select
                  value={simExposure}
                  onChange={(e) => setSimExposure(e.target.value as ExposureType)}
                  className="px-2 py-1.5 rounded-lg bg-white border border-[#d8d0bf] text-xs font-bold text-[#173829]"
                >
                  <option value="sun">Direct Sun</option>
                  <option value="shade">Shaded</option>
                  <option value="indoor">Indoor</option>
                </select>

                <select
                  value={simZone}
                  onChange={(e) => setSimZone(e.target.value as WorkZoneType)}
                  className="px-2 py-1.5 rounded-lg bg-white border border-[#d8d0bf] text-xs font-bold text-[#173829]"
                >
                  {(Object.keys(config.workZoneModifiers) as WorkZoneType[]).map((zk) => (
                    <option key={zk} value={zk}>
                      {config.workZoneModifiers[zk].label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 bg-[#f7f5ee] border border-[#e2dcd0] rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-black text-[#173829]">Instant Simulation Result</h3>

            <div className="grid grid-cols-3 gap-2 text-center font-mono text-xs">
              <div className="bg-white border border-[#e5dfd3] rounded-xl p-2.5">
                <div className="font-sans text-[10px] text-[#426050]">Est. Eff. WBGT</div>
                <strong className="text-base text-[#173829]">
                  {simResult.effectiveWbgtC.toFixed(1)}°C
                </strong>
              </div>
              <div className="bg-white border border-[#e5dfd3] rounded-xl p-2.5">
                <div className="font-sans text-[10px] text-[#426050]">Action Level</div>
                <strong className="text-sm text-[#173829]">{simResult.actionLevel}</strong>
              </div>
              <div
                className={`border rounded-xl p-2.5 ${
                  simResult.complianceStatus === 'Violation'
                    ? 'bg-[#FEE2E2] border-[#FCA5A5] text-[#991B1B]'
                    : simResult.complianceStatus === 'At risk'
                    ? 'bg-[#FEF3C7] border-[#FDE68A] text-[#92400E]'
                    : 'bg-[#DCFCE7] border-[#86EFAC] text-[#166534]'
                }`}
              >
                <div className="font-sans text-[10px] font-bold">Compliance</div>
                <strong className="text-sm">{simResult.complianceStatus}</strong>
              </div>
            </div>

            <div className="bg-white border border-[#d8d0bf] rounded-xl p-3 text-xs space-y-1">
              <div className="font-bold text-[#173829]">{simResult.complianceReason}</div>
              {simResult.recommendedFix && (
                <div className="text-[#991B1B] font-semibold">{simResult.recommendedFix}</div>
              )}
              <div className="text-[11px] font-mono text-[#426050]">
                {simResult.transparentFormulaNote}
              </div>
            </div>

            <button
              type="button"
              onClick={handleExplainWhatIfWithAi}
              disabled={isLoadingSimAi}
              className="px-3.5 py-2 rounded-xl bg-[#173829] hover:bg-[#24533d] text-[#FAF8F3] text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#A3E5C1]" />
              <span>{isLoadingSimAi ? 'Explaining Trade-offs...' : 'Explain Trade-Offs (Gemini)'}</span>
            </button>

            {simAiTradeoff && (
              <div className="bg-[#edf4f0] border border-[#c3d9cd] rounded-xl p-3 text-xs text-[#173829] space-y-1">
                <div className="text-[10px] font-bold uppercase text-[#24533D]">
                  AI-generated guidance, coordinator must review.
                </div>
                <p>{simAiTradeoff}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: ANONYMOUS INCIDENT & NEAR-MISS LOG (#7) */}
      {activeTab === 'incidents' && (
        <div className="space-y-4">
          <div className="bg-[#FEF3C7] border border-[#F59E0B] rounded-xl px-3.5 py-2 text-xs font-extrabold text-[#92400E]">
            For site learning only. Not for disciplinary use. Strictly ZERO worker names or medical details.
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const dt = new Date();
                dt.setHours(incHour, 0, 0, 0);
                onLogIncident({
                  occurredAtIso: dt.toISOString(),
                  hourOfDay: incHour,
                  zoneLabel: incZone.trim() || 'Zone A',
                  airTempC: weather.current.airTempC,
                  wbgtEstimatedC: weather.current.wbgtEstimatedC,
                  actionTaken: incAction.trim() || 'Shaded cool-down break initiated',
                  notes: incNotes.trim() || 'Site learning entry',
                });
                setIncNotes('');
              }}
              className="lg:col-span-5 bg-[#f7f5ee] border border-[#e2dcd0] rounded-xl p-4 space-y-2.5 text-xs"
            >
              <h3 className="text-sm font-black text-[#173829]">
                Log Anonymous Heat Near-Miss / Event
              </h3>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-[#426050] mb-0.5">Zone</label>
                  <input
                    type="text"
                    value={incZone}
                    onChange={(e) => setIncZone(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-[#d8d0bf] text-xs font-semibold text-[#173829]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[#426050] mb-0.5">Hour (0–23)</label>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={incHour}
                    onChange={(e) => setIncHour(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-[#d8d0bf] text-xs font-mono text-[#173829]"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#426050] mb-0.5">
                  Operational Action Taken
                </label>
                <input
                  type="text"
                  value={incAction}
                  onChange={(e) => setIncAction(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-[#d8d0bf] text-xs text-[#173829]"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#426050] mb-0.5">
                  Schedule Improvement Note (No names / medical info)
                </label>
                <input
                  type="text"
                  value={incNotes}
                  onChange={(e) => setIncNotes(e.target.value)}
                  placeholder="e.g. Shifted concrete pour to 06:30"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-[#d8d0bf] text-xs text-[#173829]"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 rounded-xl bg-[#173829] hover:bg-[#24533d] text-[#FAF8F3] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Log Anonymous Site Event</span>
              </button>
            </form>

            <div className="lg:col-span-7 bg-[#f7f5ee] border border-[#e2dcd0] rounded-xl p-4 space-y-3">
              <div className="bg-white border border-[#c3d9cd] rounded-xl p-3 text-xs">
                <div className="font-black text-[#173829] mb-1">
                  Detected Operational Pattern (Schedule Feedback)
                </div>
                <div className="text-[#24533D] font-semibold">{incidentPatterns.patternHeadline}</div>
              </div>

              <ul className="space-y-2 max-h-52 overflow-y-auto">
                {incidents.map((inc) => (
                  <li
                    key={inc.id}
                    className="bg-white border border-[#e5dfd3] rounded-xl p-3 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between font-bold text-[#173829]">
                      <span>
                        {inc.zoneLabel} · {String(inc.hourOfDay).padStart(2, '0')}:00
                      </span>
                      <span className="font-mono text-[11px] text-[#426050]">
                        Ta {inc.airTempC.toFixed(1)}°C / Est. WBGT {inc.wbgtEstimatedC.toFixed(1)}°C
                      </span>
                    </div>
                    <div className="text-[#24533D] font-semibold">Action: {inc.actionTaken}</div>
                    {inc.notes && <div className="text-[11px] text-[#426050]">{inc.notes}</div>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: MULTI-SITE PORTFOLIO (#9), AI GOVERNANCE AUDIT (#11) & JUDGE IMPACT (#13) */}
      {activeTab === 'portfolio' && (
        <div className="space-y-5">
          {/* 9. Multi-Site Portfolio Table */}
          <div className="space-y-2">
            <h3 className="text-sm font-black text-[#173829]">
              UAE Multi-Site HSE Portfolio (Sorted by Sites Needing Attention First · Aggregated Only)
            </h3>
            <div className="overflow-x-auto border border-[#e5dfd3] rounded-xl">
              <table className="w-full text-xs text-left rtl:text-right">
                <thead className="bg-[#f7f5ee] text-[#173829] border-b border-[#e5dfd3]">
                  <tr>
                    <th className="py-2.5 px-3 font-extrabold">Worksite</th>
                    <th className="py-2.5 px-3 font-extrabold">Est. WBGT</th>
                    <th className="py-2.5 px-3 font-extrabold">Action Level</th>
                    <th className="py-2.5 px-3 font-extrabold">Compliance</th>
                    <th className="py-2.5 px-3 font-extrabold">Checklist</th>
                    <th className="py-2.5 px-3 font-extrabold">Data Confidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ece6da]">
                  {portfolioRows.map((row) => (
                    <tr key={row.siteId} className="hover:bg-[#FAF8F3]">
                      <td className="py-2 px-3 font-bold text-[#173829]">
                        {isAr ? row.siteNameAr : row.siteName}
                      </td>
                      <td className="py-2 px-3 font-mono font-bold text-[#173829]">
                        {row.wbgtEstimatedC.toFixed(1)}°C
                      </td>
                      <td className="py-2 px-3">
                        <span className="px-2 py-0.5 rounded font-bold text-[11px] bg-[#edf4f0] text-[#173829]">
                          {row.actionLevel}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-bold">{row.complianceStatus}</td>
                      <td className="py-2 px-3 font-mono font-bold">{row.checklistPercent}%</td>
                      <td className="py-2 px-3 uppercase font-mono text-[10px]">
                        {row.dataConfidence}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 13. Judge Demo Impact Metrics Dashboard */}
          <div className="bg-[#f7f5ee] border border-[#e2dcd0] rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-black text-[#173829] flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4 text-[#173829]" />
                <span>Judges' Demo Operational Impact Indicators</span>
              </h3>
              <span className="px-2.5 py-0.5 rounded-full bg-[#FEF3C7] border border-[#FDE68A] text-[10px] font-bold text-[#92400E]">
                {judgeMetrics.isDemoLabel}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
              <div className="bg-white border border-[#e5dfd3] rounded-xl p-3">
                <div className="font-sans text-[10px] font-bold text-[#426050]">Rest Minutes Scheduled</div>
                <div className="text-xl font-black text-[#173829]">{judgeMetrics.restMinutesAdded}m</div>
              </div>
              <div className="bg-white border border-[#e5dfd3] rounded-xl p-3">
                <div className="font-sans text-[10px] font-bold text-[#426050]">Heavy Work Outside Peak</div>
                <div className="text-xl font-black text-[#173829]">
                  {judgeMetrics.heavyWorkMovedMinutes}m
                </div>
              </div>
              <div className="bg-white border border-[#e5dfd3] rounded-xl p-3">
                <div className="font-sans text-[10px] font-bold text-[#426050]">Midday-Ban Compliance</div>
                <div className="text-xl font-black text-[#166534]">
                  {judgeMetrics.middayBanCompliancePct}%
                </div>
              </div>
              <div className="bg-white border border-[#e5dfd3] rounded-xl p-3">
                <div className="font-sans text-[10px] font-bold text-[#426050]">Alerts Acknowledged</div>
                <div className="text-xl font-black text-[#173829]">
                  {judgeMetrics.alertsAcknowledged} / {judgeMetrics.alertsSent}
                </div>
              </div>
            </div>
          </div>

          {/* 11. Audit Trail & AI Governance Log */}
          <div className="space-y-2">
            <h3 className="text-sm font-black text-[#173829] flex items-center gap-1.5">
              <History className="w-4 h-4 text-[#173829]" />
              <span>AI Governance & Human Approval Audit Trail (Zero PII)</span>
            </h3>
            <div className="bg-[#f7f5ee] border border-[#e2dcd0] rounded-xl overflow-hidden">
              {auditLog.length === 0 ? (
                <div className="p-4 text-xs text-[#426050]">
                  Re-plan, edit a shift block, or click "Approve Schedule" to log governance decisions here.
                </div>
              ) : (
                <ul className="divide-y divide-[#e2dcd0] max-h-48 overflow-y-auto">
                  {auditLog.map((entry) => (
                    <li key={entry.id} className="p-3 text-xs bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="font-bold text-[#173829]">
                          {entry.aiSuggestionSummary} ·{' '}
                          <span className="font-mono text-[#24533D]">Engine: {entry.complianceVerdict}</span>
                        </div>
                        <div className="text-[11px] text-[#426050]">{entry.details}</div>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg bg-[#edf4f0] border border-[#c3d9cd] text-[#173829] font-bold text-[11px] shrink-0">
                        Human: {entry.humanDecision}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Printable Daily Compliance Report Modal (#2 - No window.open, zero personal data) */}
      {showComplianceReportModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#FAF8F3] border-2 border-[#173829] rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl relative text-[#173829]">
            <button
              type="button"
              onClick={() => setShowComplianceReportModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-white border border-[#d8d0bf] print:hidden cursor-pointer"
              aria-label="Close report"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="border-b-2 border-[#173829] pb-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#24533D]">
                HeatShield AI · UAE Daily Site Compliance Report
              </div>
              <h3 className="text-lg font-black">{weather.site.name}</h3>
              <div className="text-xs font-mono text-[#426050]">
                Generated: {new Date().toLocaleString()} · Weather Sync: {weather.lastUpdatedDisplay} ({weather.status})
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
              <div className="bg-white border border-[#d8d0bf] rounded-lg p-2">
                <div className="font-sans text-[10px] text-[#426050]">Est. WBGT</div>
                <strong>{weather.current.wbgtEstimatedC.toFixed(1)}°C</strong>
              </div>
              <div className="bg-white border border-[#d8d0bf] rounded-lg p-2">
                <div className="font-sans text-[10px] text-[#426050]">Compliance Verdict</div>
                <strong>{plan.overallComplianceStatus}</strong>
              </div>
              <div className="bg-white border border-[#d8d0bf] rounded-lg p-2">
                <div className="font-sans text-[10px] text-[#426050]">Schedule Approval</div>
                <strong>{plan.approved ? 'APPROVED' : 'PENDING REVIEW'}</strong>
              </div>
              <div className="bg-white border border-[#d8d0bf] rounded-lg p-2">
                <div className="font-sans text-[10px] text-[#426050]">Readiness Checklist</div>
                <strong>{checklist.completionPercent}%</strong>
              </div>
            </div>

            <div className="bg-white border border-[#d8d0bf] rounded-xl p-3 space-y-1.5 text-xs">
              <div className="font-black">Pre-Shift Checklist Results:</div>
              {checklist.items.map((it) => (
                <div key={it.id} className="flex items-start justify-between gap-2 border-b border-[#ece6da] pb-1 last:border-0">
                  <span>
                    {it.label} {it.note ? `— ${it.note}` : ''}
                  </span>
                  <strong className={it.checked ? 'text-[#166534]' : 'text-[#991B1B]'}>
                    {it.checked ? 'PASS' : 'OPEN'}
                  </strong>
                </div>
              ))}
            </div>

            <div className="bg-[#edf4f0] border border-[#c3d9cd] rounded-lg p-2.5 text-[11px] font-bold flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>
                Automated environmental guidance only. Not a medical diagnosis or treatment. Zero individual worker personal data recorded in this report.
              </span>
            </div>

            <div className="flex justify-end gap-2 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl bg-[#173829] text-[#FAF8F3] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print / Save as PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
