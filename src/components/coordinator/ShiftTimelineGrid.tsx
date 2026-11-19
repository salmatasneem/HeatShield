import React, { useState } from 'react';
import {
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Printer,
  Copy,
  Check,
  Download,
  Volume2,
  Square,
  Sliders,
  ArrowRightLeft,
  BadgeCheck,
} from 'lucide-react';
import {
  ExposureType,
  RestLocationType,
} from '../../config/complianceConfig';
import {
  CrewRosterRow,
  EnvWeatherState,
  SchedulePlanResult,
  ShiftBlockPlan,
} from '../../types/occupational';
import { DASHBOARD_COPY, DashboardLocale } from '../../services/i18n';

interface ShiftTimelineGridProps {
  locale: DashboardLocale;
  roster: CrewRosterRow[];
  weather: EnvWeatherState;
  plan: SchedulePlanResult;
  isPlanning: boolean;
  isVoicePlaying: boolean;
  onReplan: (forceMockAiViolation?: boolean) => void;
  onApprovePlan: () => void;
  onRejectPlan?: () => void;
  onUpdateBlock: (updatedBlock: ShiftBlockPlan) => void;
  onCopyWhatsApp: () => Promise<boolean>;
  onExportCsv: () => void;
  onPrintSchedule: () => void;
  onToggleVoiceAlert: () => void;
}

const TIMELINE_HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

function getBlockSurfaceStyle(
  block: ShiftBlockPlan,
  complianceStatus: 'Compliant' | 'At risk' | 'Violation'
): string {
  if (complianceStatus === 'Violation') {
    return 'bg-[#FEE2E2] border-[#DC2626] text-[#991B1B]';
  }
  if (block.isMiddayBreakWindow && block.workMinutes === 0) {
    return 'bg-[#FEF3C7] border-[#D97706] text-[#92400E]';
  }
  if (complianceStatus === 'At risk' || block.riskLevel === 'High' || block.riskLevel === 'Critical') {
    return 'bg-[#FFEDD5] border-[#EA580C] text-[#9A3412]';
  }
  if (block.riskLevel === 'Moderate' || block.restMinutes > 0) {
    return 'bg-[#FEF9C3] border-[#CA8A04] text-[#854D0E]';
  }
  return 'bg-[#DCFCE7] border-[#16A34A] text-[#166534]';
}

function formatRestLocationShort(loc: RestLocationType): string {
  switch (loc) {
    case 'air_conditioned_rest':
      return 'AC Rest';
    case 'indoor_cool_zone':
      return 'Indoor Cool';
    case 'shaded_shelter':
      return 'Shade';
    default:
      return 'Standard';
  }
}

export const ShiftTimelineGrid: React.FC<ShiftTimelineGridProps> = ({
  locale,
  roster,
  weather,
  plan,
  isPlanning,
  isVoicePlaying,
  onReplan,
  onApprovePlan,
  onRejectPlan,
  onUpdateBlock,
  onCopyWhatsApp,
  onExportCsv,
  onPrintSchedule,
  onToggleVoiceAlert,
}) => {
  const isAr = locale === 'ar';
  const copy = DASHBOARD_COPY[locale];
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [whatsAppCopied, setWhatsAppCopied] = useState(false);
  const [governanceGateNotice, setGovernanceGateNotice] = useState(false);

  const checkMap = new Map(plan.complianceChecks.map((c) => [c.blockId, c]));
  const selectedBlock = plan.blocks.find((b) => b.id === selectedBlockId) || null;
  const selectedCheck = selectedBlock ? checkMap.get(selectedBlock.id) : undefined;

  const handleCopyClick = async () => {
    if (!plan.approved) {
      setGovernanceGateNotice(true);
      return;
    }
    setGovernanceGateNotice(false);
    const ok = await onCopyWhatsApp();
    if (ok) {
      setWhatsAppCopied(true);
      setTimeout(() => setWhatsAppCopied(false), 2500);
    }
  };

  const handleVoiceClick = () => {
    if (!plan.approved && !isVoicePlaying) {
      setGovernanceGateNotice(true);
      return;
    }
    setGovernanceGateNotice(false);
    onToggleVoiceAlert();
  };

  return (
    <section
      aria-label="Daily Crew Work-Rest Timeline"
      className="bg-white border border-[#DED5C5] rounded-2xl p-4 sm:p-5 space-y-4"
    >
      {/* Header & Coordinator Action Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-base sm:text-lg font-extrabold text-[#173829]">
              {isAr ? 'الجدول الزمني للعمل والراحة (اليوم)' : 'Daily Work-Rest Schedule Timeline'}
            </h2>
            {plan.validatedByComplianceEngine && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-[#EBF5F0] border border-[#B8DEC7] text-[#173829] text-xs font-bold">
                <ShieldCheck className="w-3.5 h-3.5 text-[#166534]" />
                <span>{copy.validatedBadge}</span>
              </span>
            )}
            {plan.approved && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-[#173829] text-[#FAF8F3] text-xs font-bold">
                <BadgeCheck className="w-3.5 h-3.5 text-[#A3E5C1]" />
                <span>{copy.approvedBadge}</span>
              </span>
            )}
          </div>
          <p className="text-xs text-[#4A6857]">
            {isAr
              ? 'النافذة المظللة تمثل حظر الظهيرة (12:30–15:00). اضغط على أي ساعة لتعديل مدة العمل/الراحة والتحقق من الامتثال فوراً.'
              : 'Shaded band highlights 12:30–15:00 Midday Break window. Click any shift block to adjust work/rest minutes or exposure and verify compliance live.'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <button
            type="button"
            onClick={() => onReplan(false)}
            disabled={isPlanning}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#173829] hover:bg-[#24533D] text-[#FAF8F3] text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${isPlanning ? 'animate-spin' : ''}`} />
            <span>{isPlanning ? (isAr ? 'جاري التخطيط...' : 'Planning...') : copy.replanBtn}</span>
          </button>

          <button
            type="button"
            onClick={() => onReplan(true)}
            disabled={isPlanning}
            title="Test deterministic compliance guardrail against a rule-breaking AI proposal"
            className="min-h-[44px] px-3 py-2 rounded-xl bg-[#FEF3C7] hover:bg-[#FDE68A] border border-[#F59E0B] text-[#92400E] text-xs font-bold cursor-pointer disabled:opacity-60"
          >
            {isAr ? 'اختبار رفض مخالفة AI' : 'Test AI Guardrail'}
          </button>

          <button
            type="button"
            onClick={() => {
              setGovernanceGateNotice(false);
              onApprovePlan();
            }}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
              plan.approved
                ? 'bg-[#DCFCE7] border-[#86EFAC] text-[#166534]'
                : 'bg-white hover:bg-[#F4EFE6] border-[#D4CBB9] text-[#173829]'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{plan.approved ? (isAr ? 'تم الاعتماد' : 'Approved') : copy.approveBtn}</span>
          </button>

          {onRejectPlan && (
            <button
              type="button"
              onClick={onRejectPlan}
              title="Reject current AI schedule draft & revert to rule-based baseline"
              className="min-h-[44px] px-3 py-2 rounded-xl bg-white hover:bg-[#FEE2E2] border border-[#FCA5A5] text-[#991B1B] text-xs font-bold flex items-center gap-1 cursor-pointer"
            >
              <XCircle className="w-4 h-4" />
              <span>{isAr ? 'رفض المسودة' : 'Reject'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleVoiceClick}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#EBF5F0] hover:bg-[#DCEBE2] border border-[#C5DFD0] text-[#173829] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            {isVoicePlaying ? <Square className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            <span>
              {isVoicePlaying
                ? isAr
                  ? 'إيقاف الصوت'
                  : 'Stop Voice'
                : isAr
                ? 'تنبيه صوتي'
                : 'Voice Alert'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleCopyClick}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#FAF8F3] hover:bg-[#EFE9DC] border border-[#D4CBB9] text-[#173829] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            {whatsAppCopied ? <Check className="w-4 h-4 text-[#166534]" /> : <Copy className="w-4 h-4" />}
            <span>{whatsAppCopied ? (isAr ? 'تم النسخ' : 'Copied!') : 'WhatsApp'}</span>
          </button>

          <button
            type="button"
            onClick={onExportCsv}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-[#FAF8F3] hover:bg-[#EFE9DC] border border-[#D4CBB9] text-[#173829] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>CSV</span>
          </button>

          <button
            type="button"
            onClick={onPrintSchedule}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-[#FAF8F3] hover:bg-[#EFE9DC] border border-[#D4CBB9] text-[#173829] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>{isAr ? 'طباعة / PDF' : 'Print / PDF'}</span>
          </button>
        </div>
      </div>

      {/* AI Governance Verdict Strip + Mandatory Human Approval Gate Alert */}
      <div className="bg-[#FAF8F3] border border-[#E6DFD1] rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex flex-wrap items-center gap-2 text-[#173829] font-semibold">
          <span>
            <strong>AI Suggestion:</strong> {plan.source === 'gemini' ? 'Gemini Draft' : 'Deterministic Baseline'}
            {plan.aiRejected ? ' (Auto-Rejected)' : ''}
          </span>
          <span>·</span>
          <span>
            <strong>Compliance Verdict:</strong> {plan.overallComplianceStatus}
          </span>
          <span>·</span>
          <span>
            <strong>Human Decision:</strong> {plan.approved ? 'Approved ✓' : 'Pending Coordinator Approval'}
          </span>
        </div>
      </div>

      {governanceGateNotice && !plan.approved && (
        <div className="bg-[#FEF3C7] border border-[#F59E0B] text-[#92400E] rounded-xl px-3.5 py-2 text-xs font-bold">
          {isAr
            ? 'يتطلب اعتماد المنسق البشري أولاً قبل إرسال أي تنبيه صوتي أو عبر واتساب.'
            : 'Mandatory Governance Gate: Human coordinator approval is required before sending alerts. Click "Approve Schedule" first.'}
        </div>
      )}

      {/* What Changed Diff Banner after Re-plan */}
      {plan.diffFromPrevious.length > 0 && (
        <div className="bg-[#F4EFE6] border border-[#D4CBB9] rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-extrabold text-[#173829]">
            <ArrowRightLeft className="w-4 h-4" />
            <span>{copy.whatChangedTitle}</span>
            <span className="font-mono text-[#557564]">({plan.diffFromPrevious.length} updates)</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-[11px]">
            {plan.diffFromPrevious.slice(0, 6).map((d, idx) => (
              <div key={idx} className="bg-white border border-[#E6DFD1] rounded-lg px-2.5 py-1.5 font-mono text-[#173829]">
                <strong>{d.crew_id}</strong> {d.timeRange} · {d.field}:{' '}
                <span className="line-through text-[#6C8D7B]">{d.before}</span> →{' '}
                <strong className="text-[#166534]">{d.after}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Horizontal Scrollable Day Timeline Matrix */}
      <div className="overflow-x-auto border border-[#DED5C5] rounded-xl">
        <table className="w-full min-w-[960px] border-collapse text-xs">
          <thead>
            <tr className="bg-[#F4EFE6] border-b border-[#DED5C5]">
              <th className="py-2.5 px-3 text-left rtl:text-right font-extrabold text-[#173829] w-44 sticky left-0 bg-[#F4EFE6] z-10 border-r border-[#DED5C5]">
                {isAr ? 'الفريق والنشاط' : 'Crew / Task'}
              </th>
              {TIMELINE_HOURS.map((h) => {
                const envH = weather.hourly.find((m) => m.hourIndex === h);
                const isMidday = h === 12 || h === 13 || h === 14;
                return (
                  <th
                    key={h}
                    className={`py-2 px-1.5 text-center font-mono tabular-nums border-r border-[#E6DFD1] ${
                      isMidday ? 'bg-[#FEF3C7] text-[#92400E]' : 'text-[#2D4D3C]'
                    }`}
                  >
                    <div className="font-bold">{`${String(h).padStart(2, '0')}:00`}</div>
                    <div className="text-[10px] font-normal">
                      {envH ? `${envH.wbgtEstimatedC.toFixed(1)}°` : '--'}
                    </div>
                    {isMidday && (
                      <div className="text-[9px] font-sans font-extrabold uppercase tracking-tight">
                        {h === 12 ? '12:30 BAN' : 'MIDDAY BAN'}
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-[#E6DFD1]">
            {roster.map((crew) => (
              <tr key={crew.crew_id} className="align-top">
                <td className="py-2.5 px-3 sticky left-0 bg-white z-10 border-r border-[#DED5C5]">
                  <div className="font-mono font-extrabold text-[#173829]">{crew.crew_id}</div>
                  <div className="text-[11px] text-[#2D4D3C] font-medium line-clamp-2">
                    {crew.taskType}
                  </div>
                  <div className="text-[10px] text-[#557564] mt-1 font-mono">
                    {crew.workload} · {crew.exposure} · {crew.shiftStart}-{crew.shiftEnd}
                  </div>
                </td>

                {TIMELINE_HOURS.map((h) => {
                  const block = plan.blocks.find((b) => b.crew_id === crew.crew_id && b.hourIndex === h);
                  const isMidday = h === 12 || h === 13 || h === 14;

                  if (!block) {
                    return (
                      <td
                        key={h}
                        className={`p-1.5 border-r border-[#EFE9DC] text-center text-[10px] text-[#8FA89B] ${
                          isMidday ? 'bg-[#FFFBEB]' : 'bg-[#FAF8F3]'
                        }`}
                      >
                        Off shift
                      </td>
                    );
                  }

                  const check = checkMap.get(block.id);
                  const compStatus = check?.status || 'Compliant';
                  const surfaceCls = getBlockSurfaceStyle(block, compStatus);
                  const isSelected = selectedBlockId === block.id;

                  return (
                    <td
                      key={h}
                      className={`p-1 border-r border-[#EFE9DC] ${isMidday ? 'bg-[#FFFBEB]' : ''}`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedBlockId(isSelected ? null : block.id)}
                        aria-label={`Edit ${block.crew_id} at ${block.timeRange}`}
                        className={`w-full text-left rounded-lg border p-1.5 transition-all cursor-pointer ${surfaceCls} ${
                          isSelected ? 'ring-2 ring-[#173829]' : 'hover:opacity-90'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 font-mono font-extrabold text-[11px] tabular-nums">
                          <span>
                            {block.workMinutes}/{block.restMinutes}m
                          </span>
                          {compStatus === 'Violation' ? (
                            <XCircle className="w-3.5 h-3.5 shrink-0" />
                          ) : compStatus === 'At risk' ? (
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          )}
                        </div>
                        <div className="text-[10px] font-bold mt-0.5 truncate">
                          {block.workMinutes === 0 ? 'STOP / REST' : block.riskLevel}
                        </div>
                        <div className="text-[9px] opacity-85 truncate">
                          {formatRestLocationShort(block.restLocation)} · {block.hydrationMlPerHour}ml
                        </div>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}

            {/* Rest-Area Occupancy & First-Aider Coverage Timeline Row */}
            {plan.restOccupancy && plan.restOccupancy.length > 0 && (
              <tr className="bg-[#FAF8F3] border-t-2 border-[#DED5C5]">
                <td className="py-2.5 px-3 sticky left-0 bg-[#FAF8F3] z-10 border-r border-[#DED5C5]">
                  <div className="font-extrabold text-[11px] text-[#173829]">
                    {isAr ? 'إشغال الاستراحات والإسعاف' : 'Rest-Area Occupancy'}
                  </div>
                  <div className="text-[10px] text-[#557564]">
                    {isAr ? 'السعة وتغطية المسعف' : 'Crews resting / capacity · First-aider'}
                  </div>
                </td>
                {TIMELINE_HOURS.map((h) => {
                  const occ = plan.restOccupancy?.find((o) => o.hourIndex === h);
                  if (!occ) {
                    return <td key={h} className="p-1.5 border-r border-[#EFE9DC]" />;
                  }
                  return (
                    <td key={h} className="p-1.5 border-r border-[#EFE9DC] text-center font-mono text-[10px]">
                      <div
                        className={`rounded-md px-1 py-1 border font-bold ${
                          occ.overCapacity
                            ? 'bg-[#FEE2E2] border-[#FCA5A5] text-[#991B1B]'
                            : occ.crewsResting > 0
                            ? 'bg-[#EBF5F0] border-[#B8DEC7] text-[#173829]'
                            : 'bg-white border-[#E6DFD1] text-[#6C8D7B]'
                        }`}
                      >
                        <div>
                          {occ.crewsResting}/{occ.capacityCrews}
                        </div>
                        <div className="text-[9px] font-sans">
                          {occ.firstAiderAvailable ? 'FA ✓' : 'No FA!'}
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Risk & Compliance Legend (Text + Color, never color alone) */}
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-[#4A6857]">
        <span className="font-bold text-[#173829]">Legend:</span>
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5 text-[#166534]" /> Low / Compliant
        </span>
        <span className="inline-flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5 text-[#92400E]" /> Moderate / Midday Rest (12:30–15:00)
        </span>
        <span className="inline-flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5 text-[#9A3412]" /> High / At risk
        </span>
        <span className="inline-flex items-center gap-1">
          <XCircle className="w-3.5 h-3.5 text-[#991B1B]" /> Rule Violation
        </span>
      </div>

      {/* Inline Block Coordinator Editor */}
      {selectedBlock && (
        <div className="bg-[#FAF8F3] border border-[#D4CBB9] rounded-xl p-4 space-y-3 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#173829]" />
              <h3 className="text-xs sm:text-sm font-extrabold text-[#173829]">
                Edit Shift Block: {selectedBlock.crew_id} · {selectedBlock.timeRange}
              </h3>
            </div>
            {selectedCheck && (
              <span
                className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${
                  selectedCheck.status === 'Violation'
                    ? 'bg-[#FEE2E2] border-[#FCA5A5] text-[#991B1B]'
                    : selectedCheck.status === 'At risk'
                    ? 'bg-[#FEF3C7] border-[#FDE68A] text-[#92400E]'
                    : 'bg-[#DCFCE7] border-[#86EFAC] text-[#166534]'
                }`}
              >
                {selectedCheck.status} — {selectedCheck.reason}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-[#4A6857] mb-1">
                Work / Rest Ratio
              </label>
              <select
                value={selectedBlock.workMinutes}
                onChange={(e) => {
                  const work = parseInt(e.target.value, 10);
                  onUpdateBlock({
                    ...selectedBlock,
                    workMinutes: work,
                    restMinutes: 60 - work,
                    coordinatorEdited: true,
                  });
                }}
                className="min-h-[40px] w-full px-2.5 rounded-lg bg-white border border-[#D4CBB9] text-xs font-mono font-bold text-[#173829]"
              >
                <option value={60}>60m work / 0m rest</option>
                <option value={45}>45m work / 15m rest</option>
                <option value={30}>30m work / 30m rest</option>
                <option value={15}>15m work / 45m rest</option>
                <option value={0}>0m work / 60m STOP</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#4A6857] mb-1">
                Exposure
              </label>
              <select
                value={selectedBlock.exposure}
                onChange={(e) =>
                  onUpdateBlock({
                    ...selectedBlock,
                    exposure: e.target.value as ExposureType,
                    coordinatorEdited: true,
                  })
                }
                className="min-h-[40px] w-full px-2.5 rounded-lg bg-white border border-[#D4CBB9] text-xs font-semibold text-[#173829]"
              >
                <option value="sun">Direct Sun (sun)</option>
                <option value="shade">Shaded Canopy (shade)</option>
                <option value="indoor">Indoor / Enclosed (indoor)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#4A6857] mb-1">
                Rest Location
              </label>
              <select
                value={selectedBlock.restLocation}
                onChange={(e) =>
                  onUpdateBlock({
                    ...selectedBlock,
                    restLocation: e.target.value as RestLocationType,
                    coordinatorEdited: true,
                  })
                }
                className="min-h-[40px] w-full px-2.5 rounded-lg bg-white border border-[#D4CBB9] text-xs font-semibold text-[#173829]"
              >
                <option value="none_needed">Standard Zone</option>
                <option value="shaded_shelter">Shaded Cooling Shelter</option>
                <option value="air_conditioned_rest">Air-Conditioned Rest Cabin</option>
                <option value="indoor_cool_zone">Indoor Ventilated Zone</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#4A6857] mb-1">
                Hydration Target
              </label>
              <select
                value={selectedBlock.hydrationMlPerHour}
                onChange={(e) =>
                  onUpdateBlock({
                    ...selectedBlock,
                    hydrationMlPerHour: parseInt(e.target.value, 10),
                    coordinatorEdited: true,
                  })
                }
                className="min-h-[40px] w-full px-2.5 rounded-lg bg-white border border-[#D4CBB9] text-xs font-mono font-bold text-[#173829]"
              >
                <option value={500}>500 ml / hr</option>
                <option value={750}>750 ml / hr</option>
                <option value={1000}>1,000 ml / hr</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#4A6857] mb-1">
                Task Note
              </label>
              <input
                type="text"
                value={selectedBlock.taskNote}
                onChange={(e) =>
                  onUpdateBlock({
                    ...selectedBlock,
                    taskNote: e.target.value,
                    coordinatorEdited: true,
                  })
                }
                className="min-h-[40px] w-full px-2.5 rounded-lg bg-white border border-[#D4CBB9] text-xs text-[#173829]"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
