import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  Eye,
  ShieldAlert,
  WifiOff,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { ActionEscalationLevel, ComplianceConfig } from '../../config/complianceConfig';
import {
  DataConfidenceLevel,
  DynamicTriggerEvaluation,
  EnvWeatherState,
  SchedulePlanResult,
} from '../../types/occupational';
import { AppLocale } from '../../utils/i18n';

interface TriggerAndTrustBannerProps {
  locale: AppLocale;
  weather: EnvWeatherState;
  triggerEval: DynamicTriggerEvaluation;
  config: ComplianceConfig;
  checklistCompletionPct: number;
  selectedZoneSummary: string;
  proactiveProposedPlan?: SchedulePlanResult | null;
  onAcceptProactivePlan?: () => void;
  onRejectProactivePlan?: () => void;
}

function getLevelBadgeStyle(level: ActionEscalationLevel): string {
  switch (level) {
    case 'Stop work':
      return 'bg-[#C81D25] text-white border-[#991B1B]';
    case 'Restrict':
      return 'bg-[#FFEDD5] text-[#9A3412] border-[#EA580C]';
    case 'Advisory':
      return 'bg-[#FEF3C7] text-[#92400E] border-[#F59E0B]';
    default:
      return 'bg-[#DCFCE7] text-[#166534] border-[#16A34A]';
  }
}

export const TriggerAndTrustBanner: React.FC<TriggerAndTrustBannerProps> = ({
  locale,
  weather,
  triggerEval,
  config,
  checklistCompletionPct,
  selectedZoneSummary,
  proactiveProposedPlan,
  onAcceptProactivePlan,
  onRejectProactivePlan,
}) => {
  const isAr = locale === 'ar';
  const [showExplainability, setShowExplainability] = useState(false);

  const isSiteMeasured = weather.measurementMode === 'site_measured';
  const confidence: DataConfidenceLevel =
    weather.status === 'live' ? 'live' : 'stale';

  return (
    <div className="bg-white border border-[#e5dfd3] rounded-2xl p-4 sm:p-5 shadow-xs space-y-3.5">
      {/* Row 1: Action Escalation Level + Data Source (Regional forecast vs Site-measured) + Explainability */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className={`px-3 py-1 rounded-xl text-xs font-black border flex items-center gap-1.5 ${getLevelBadgeStyle(
              triggerEval.currentLevel
            )}`}
          >
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>
              {isAr ? 'مستوى الإجراء:' : 'Site Action Level:'} {triggerEval.currentLevel.toUpperCase()}
            </span>
          </span>

          <span className="px-2.5 py-1 rounded-lg bg-[#f7f5ee] border border-[#e2dcd0] text-[11px] font-mono font-bold text-[#173829]">
            {isAr ? 'WBGT الفعال (تقديري):' : 'Effective Est. WBGT:'} {triggerEval.wbgtEffectiveC.toFixed(1)}°C
          </span>

          <span
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1 ${
              isSiteMeasured
                ? 'bg-[#173829] border-[#173829] text-[#A3E5C1]'
                : confidence === 'live'
                ? 'bg-[#edf4f0] border-[#c3d9cd] text-[#166534]'
                : 'bg-[#fef3c7] border-[#fde68a] text-[#92400e]'
            }`}
          >
            {confidence === 'live' ? (
              <Database className="w-3.5 h-3.5" />
            ) : (
              <WifiOff className="w-3.5 h-3.5" />
            )}
            <span>
              {isSiteMeasured
                ? isAr
                  ? `قراءة ميدانية بالموقع · ${weather.lastUpdatedDisplay}`
                  : `Site-measured · ${weather.lastUpdatedDisplay}`
                : confidence === 'live'
                ? isAr
                  ? `توقعات إقليمية حية · ${weather.lastUpdatedDisplay}`
                  : `Regional forecast · ${weather.lastUpdatedDisplay}`
                : `STALE / CONSERVATIVE FALLBACK · Last update: ${weather.lastUpdatedDisplay}`}
            </span>
          </span>

          <span className="px-2.5 py-1 rounded-lg bg-[#f7f5ee] border border-[#e2dcd0] text-[11px] font-bold text-[#173829]">
            Readiness: {checklistCompletionPct}%
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShowExplainability((v) => !v)}
          className="px-3 py-1.5 rounded-xl bg-[#edf4f0] hover:bg-[#dcebe2] border border-[#c3d9cd] text-[#173829] text-xs font-bold flex items-center gap-1.5 self-start lg:self-auto cursor-pointer"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>{isAr ? 'مؤشرات الثقة وشرح الحساب' : 'Data Trust & Explainability'}</span>
          {showExplainability ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Proactive 3-Hour Look-Ahead Proposed Re-plan Banner (Requires Coordinator Approval) */}
      {proactiveProposedPlan && (
        <div
          role="region"
          aria-label="Proactive schedule re-plan review"
          className="bg-[#FFFBEB] border-2 border-[#D97706] rounded-xl p-3.5 space-y-2.5 text-xs text-[#173829]"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
              <div>
                <div className="font-black text-[#92400E]">
                  {isAr
                    ? 'تغير الظروف خلال 3 ساعات: أعد الذكاء الاصطناعي جدولاً أكثر أماناً لمراجعتك'
                    : 'Conditions changing: AI has prepared a safer schedule for your review'}
                </div>
                <div className="text-[11px] text-[#78350F]">
                  {proactiveProposedPlan.whyThisSchedule} (Awaiting human coordinator decision — no crew alerts sent yet.)
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 print:hidden">
              {onAcceptProactivePlan && (
                <button
                  type="button"
                  onClick={onAcceptProactivePlan}
                  className="px-3 py-1.5 rounded-lg bg-[#173829] hover:bg-[#24533D] text-[#FAF8F3] font-bold text-[11px] cursor-pointer"
                >
                  {isAr ? 'اعتماد المقترح الآمن' : 'Review & Apply Plan'}
                </button>
              )}
              {onRejectProactivePlan && (
                <button
                  type="button"
                  onClick={onRejectProactivePlan}
                  className="px-3 py-1.5 rounded-lg bg-white hover:bg-[#FEE2E2] border border-[#D4CBB9] text-[#991B1B] font-bold text-[11px] cursor-pointer"
                >
                  {isAr ? 'رفض المقترح' : 'Reject Draft'}
                </button>
              )}
            </div>
          </div>

          {proactiveProposedPlan.diffFromPrevious.length > 0 && (
            <div className="bg-white border border-[#FDE68A] rounded-lg p-2.5 space-y-1">
              <div className="font-extrabold text-[11px] text-[#92400E]">
                What changed & why ({proactiveProposedPlan.diffFromPrevious.length} adjustments):
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-[11px] font-mono">
                {proactiveProposedPlan.diffFromPrevious.slice(0, 4).map((d, i) => (
                  <div key={i} className="truncate text-[#173829]">
                    <strong>{d.crew_id}</strong> {d.timeRange}:{' '}
                    <span className="line-through text-[#6C8D7B]">{d.before}</span> →{' '}
                    <strong className="text-[#166534]">{d.after}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stale Weather Conservative Warning */}
      {weather.status !== 'live' && (
        <div className="bg-[#FEF3C7] border border-[#F59E0B] rounded-xl px-3.5 py-2.5 text-xs text-[#92400E] font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-[#B45309]" />
          <span>
            {isAr
              ? `البيانات الحية غير متوفرة حالياً — يتم تطبيق الإعدادات الصيفية المحافظة (${config.conservativeOfflineDefaults.wbgtEstimatedC}°C WBGT تقديري) بناءً على آخر تحديث في ${weather.lastUpdatedDisplay}.`
              : `Live feed is stale or offline — switched automatically to conservative safety defaults (${config.conservativeOfflineDefaults.wbgtEstimatedC}°C est. WBGT) based on last update at ${weather.lastUpdatedDisplay}.`}
          </span>
        </div>
      )}

      {/* Row 2: 3-Hour Look-Ahead & Recommended Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-6 bg-[#f7f5ee] border border-[#e2dcd0] rounded-xl p-3 space-y-1.5">
          <div className="text-[11px] font-extrabold text-[#173829] uppercase tracking-wider flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#24533D]" />
            <span>{isAr ? 'قائمة الإجراءات المطلوبة الآن' : 'Required Site Actions for Current Level'}</span>
          </div>
          <ul className="list-disc pl-4 rtl:pr-4 text-xs text-[#2D4D3C] space-y-1">
            {triggerEval.recommendedActions.map((act, idx) => (
              <li key={idx}>{act}</li>
            ))}
          </ul>
        </div>

        <div className="lg:col-span-6 bg-[#FAF8F3] border border-[#DED5C5] rounded-xl p-3 space-y-2">
          <div className="text-[11px] font-extrabold text-[#173829] uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-[#173829]" />
            <span>{isAr ? 'استشراف الـ 3 ساعات القادمة' : '3-Hour Look-Ahead Trigger'}</span>
          </div>
          {triggerEval.lookAheadWarning ? (
            <div className="p-2 rounded-lg bg-[#FFEDD5] border border-[#FDBA74] text-[#9A3412] text-xs font-bold">
              {triggerEval.lookAheadWarning}
            </div>
          ) : (
            <div className="text-xs text-[#24533D] font-semibold">
              {isAr
                ? 'لا يوجد تصاعد إضافي متوقع خلال الساعات الثلاث القادمة.'
                : 'No escalation threshold crossing forecast in the next 3 hours.'}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {triggerEval.threeHourOutlook.map((item) => (
              <span
                key={item.hourLabel}
                className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border ${getLevelBadgeStyle(
                  item.level
                )}`}
              >
                {item.hourLabel}: {item.wbgtEstimatedC.toFixed(1)}°C ({item.level})
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Expandable Explainability Panel */}
      {showExplainability && (
        <div className="bg-[#f7f5ee] border border-[#d8d0bf] rounded-xl p-3.5 space-y-2 text-xs text-[#173829]">
          <div className="font-extrabold">
            {isAr
              ? 'لوحة الشفافية: جميع المدخلات والقواعد المستخدمة في التوصية الحالية'
              : 'Explainability Panel — Every Input & Rule Used'}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
            <div className="bg-white border border-[#e5dfd3] rounded-lg p-2">
              <div className="font-sans text-[10px] text-[#426050]">Air Temp / RH</div>
              <strong>
                {weather.current.airTempC.toFixed(1)}°C / {weather.current.relativeHumidityPct}%
              </strong>
            </div>
            <div className="bg-white border border-[#e5dfd3] rounded-lg p-2">
              <div className="font-sans text-[10px] text-[#426050]">Wind / Solar</div>
              <strong>
                {weather.current.windSpeedKmh.toFixed(1)} km/h / {weather.current.solarRadiationWm2} W/m²
              </strong>
            </div>
            <div className="bg-white border border-[#e5dfd3] rounded-lg p-2">
              <div className="font-sans text-[10px] text-[#426050]">Zone / PPE Factor</div>
              <strong>{selectedZoneSummary}</strong>
            </div>
            <div className="bg-white border border-[#e5dfd3] rounded-lg p-2">
              <div className="font-sans text-[10px] text-[#426050]">Trigger Rule</div>
              <strong>{config.escalationTriggers.ruleName}</strong>
            </div>
          </div>
          <div className="text-[11px] text-[#426050]">
            <strong>Trigger Summary:</strong> {triggerEval.triggerReason} · {config.verificationNotice}
          </div>
        </div>
      )}
    </div>
  );
};
