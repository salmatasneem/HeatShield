import React, { useState } from 'react';
import {
  Sparkles,
  ShieldAlert,
  PhoneCall,
  Lock,
  SlidersHorizontal,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import {
  ComplianceConfig,
} from '../../config/complianceConfig';
import { SchedulePlanResult } from '../../types/occupational';
import { DASHBOARD_COPY, DashboardLocale } from '../../services/i18n';

interface SideGuidancePanelProps {
  locale: DashboardLocale;
  plan: SchedulePlanResult;
  config: ComplianceConfig;
  forceMiddaySeason: boolean;
  onToggleForceMiddaySeason: (val: boolean) => void;
  onUpdateConfig: (updated: ComplianceConfig) => void;
}

export const SideGuidancePanel: React.FC<SideGuidancePanelProps> = ({
  locale,
  plan,
  config,
  forceMiddaySeason,
  onToggleForceMiddaySeason,
  onUpdateConfig,
}) => {
  const isAr = locale === 'ar';
  const copy = DASHBOARD_COPY[locale];
  const [showConfigEditor, setShowConfigEditor] = useState(false);

  const violations = plan.complianceChecks.filter((c) => c.status === 'Violation');
  const atRisks = plan.complianceChecks.filter((c) => c.status === 'At risk');
  const compliantCount = plan.complianceChecks.filter((c) => c.status === 'Compliant').length;

  return (
    <aside className="space-y-4">
      {/* 1. AI Risk Drivers & Schedule Rationale */}
      <section className="bg-white border border-[#DED5C5] rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#173829] shrink-0" />
            <h2 className="text-sm font-extrabold text-[#173829]">
              {isAr ? 'ملخص مخاطر الحرارة وخطة العمل' : 'Why This Schedule & Risk Drivers'}
            </h2>
          </div>
          <span className="text-[11px] font-mono text-[#557564]">
            {plan.source === 'gemini' ? 'Gemini + Engine' : 'Deterministic Engine'}
          </span>
        </div>

        {/* Mandatory explicit label on every AI-generated text block */}
        <div className="bg-[#FAF8F3] border border-[#DED5C5] rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-[#2D4D3C]">
          {copy.aiGuidanceLabel}
        </div>

        {/* Deterministic Rejection Banner if AI violated UAE compliance rules */}
        {plan.aiRejected && (
          <div
            role="alert"
            className="bg-[#FEE2E2] border border-[#FCA5A5] text-[#991B1B] rounded-xl p-3 space-y-1.5 text-xs"
          >
            <div className="font-extrabold flex items-center gap-1.5">
              <XCircle className="w-4 h-4 shrink-0" />
              <span>
                AI Draft Auto-Rejected by Deterministic Compliance Engine
              </span>
            </div>
            <p className="text-[11px] leading-snug">
              The AI proposal violated UAE regulatory rules and was automatically replaced with the compliant deterministic fallback schedule:
            </p>
            <ul className="list-disc pl-4 text-[11px] space-y-0.5">
              {plan.aiRejectionReasons.slice(0, 3).map((reason, idx) => (
                <li key={idx}>{reason}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-2 text-xs text-[#2D4D3C] leading-relaxed">
          <div>
            <div className="font-bold text-[#173829] mb-0.5">
              {isAr ? 'أبرز مسببات الإجهاد الحراري:' : 'Top Thermal Risk Drivers'}
            </div>
            <p>{plan.riskDriversExplanation}</p>
          </div>

          <div>
            <div className="font-bold text-[#173829] mb-0.5">
              {isAr ? 'لماذا تم اختيار هذا الجدول؟' : 'Why This Schedule'}
            </div>
            <p>{plan.whyThisSchedule}</p>
          </div>

          {plan.topTaskReorderingSuggestions.length > 0 && (
            <div>
              <div className="font-bold text-[#173829] mb-1">
                {isAr ? 'توصيات إعادة ترتيب المهام:' : 'Suggested Task Reordering'}
              </div>
              <ul className="list-disc pl-4 rtl:pr-4 space-y-1 text-[11px]">
                {plan.topTaskReorderingSuggestions.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
            </div>
          )}

          {plan.dangerousConditions && plan.dangerousConditions.length > 0 && (
            <div className="pt-2 border-t border-[#E6DFD1] space-y-1.5">
              <div className="font-extrabold text-[#991B1B] flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {isAr ? 'تنبيهات ظروف العمل الخطرة:' : `Dangerous-Condition Alerts (${plan.dangerousConditions.length})`}
                </span>
              </div>
              <ul className="space-y-1.5">
                {plan.dangerousConditions.slice(0, 4).map((dc) => (
                  <li
                    key={dc.id}
                    className="bg-[#FFF5F5] border border-[#FECACA] rounded-lg p-2 text-[11px] text-[#7F1D1D]"
                  >
                    <div className="font-bold">
                      {dc.crew_id} · {dc.timeRange} ({dc.severity})
                    </div>
                    <div>{dc.summary}</div>
                    <div className="text-[#991B1B] font-semibold mt-0.5">{dc.recommendation}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* 2. Deterministic UAE Compliance Status Panel & Threshold Config */}
      <section className="bg-white border border-[#DED5C5] rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-extrabold text-[#173829]">
            {isAr ? 'محرك الامتثال التنظيمي (الإمارات)' : 'UAE Compliance Engine'}
          </h2>
          <button
            type="button"
            onClick={() => setShowConfigEditor((p) => !p)}
            className="text-xs font-bold text-[#173829] hover:underline flex items-center gap-1 cursor-pointer print:hidden"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{showConfigEditor ? 'Hide Thresholds' : 'Thresholds'}</span>
          </button>
        </div>

        {/* Summary counts */}
        <div className="grid grid-cols-3 gap-2 text-center font-mono text-xs">
          <div className="bg-[#DCFCE7] border border-[#86EFAC] text-[#166534] rounded-xl py-2 px-1">
            <div className="text-base font-extrabold">{compliantCount}</div>
            <div className="font-sans text-[10px] font-bold">Compliant</div>
          </div>
          <div className="bg-[#FEF3C7] border border-[#FDE68A] text-[#92400E] rounded-xl py-2 px-1">
            <div className="text-base font-extrabold">{atRisks.length}</div>
            <div className="font-sans text-[10px] font-bold">At risk</div>
          </div>
          <div className="bg-[#FEE2E2] border border-[#FCA5A5] text-[#991B1B] rounded-xl py-2 px-1">
            <div className="text-base font-extrabold">{violations.length}</div>
            <div className="font-sans text-[10px] font-bold">Violation</div>
          </div>
        </div>

        {/* Midday Break Season Toggle */}
        <label className="flex items-start gap-2 text-xs text-[#2D4D3C] bg-[#FAF8F3] border border-[#E6DFD1] rounded-xl p-2.5 cursor-pointer print:hidden">
          <input
            type="checkbox"
            checked={forceMiddaySeason}
            onChange={(e) => onToggleForceMiddaySeason(e.target.checked)}
            className="mt-0.5 rounded accent-[#173829]"
          />
          <span>
            <strong className="text-[#173829]">Enforce UAE MOHRE Midday Break (15 Jun – 15 Sep)</strong>
            <span className="block text-[11px] text-[#557564]">
              Prohibits open-sun outdoor work 12:30 PM – 3:00 PM; requires shaded rest & water.
            </span>
          </span>
        </label>

        {/* Triggered Rule List */}
        <div className="max-h-48 overflow-y-auto space-y-1.5 text-[11px]">
          {violations.map((v) => (
            <div key={v.blockId} className="bg-[#FEE2E2] border border-[#FCA5A5] text-[#991B1B] rounded-lg p-2">
              <div className="font-bold flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Violation · {v.crew_id} ({v.timeRange})
                </span>
              </div>
              <div className="mt-0.5">{v.reason}</div>
            </div>
          ))}
          {atRisks.slice(0, 4).map((r) => (
            <div key={r.blockId} className="bg-[#FEF3C7] border border-[#FDE68A] text-[#92400E] rounded-lg p-2">
              <div className="font-bold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>
                  At risk · {r.crew_id} ({r.timeRange})
                </span>
              </div>
              <div className="mt-0.5">{r.reason}</div>
            </div>
          ))}
          {violations.length === 0 && atRisks.length === 0 && (
            <div className="bg-[#DCFCE7] border border-[#86EFAC] text-[#166534] rounded-lg p-2.5 flex items-center gap-2 font-semibold">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>All scheduled crew blocks pass deterministic UAE compliance rules.</span>
            </div>
          )}
        </div>

        {/* Editable Thresholds Note & Controls */}
        <div className="text-[11px] text-[#557564] bg-[#FAF8F3] border border-[#E6DFD1] rounded-lg p-2.5">
          <strong>Regulatory Note:</strong> {config.verificationNotice}
        </div>

        {showConfigEditor && (
          <div className="bg-[#FAF8F3] border border-[#D4CBB9] rounded-xl p-3 space-y-2.5 text-xs print:hidden">
            <div className="font-bold text-[#173829]">
              Editable Config (src/config/complianceConfig.ts)
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-[#4A6857]">
                  Shade Required WBGT (°C)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={config.provisions.shadeRequiredWbgtC}
                  onChange={(e) =>
                    onUpdateConfig({
                      ...config,
                      provisions: {
                        ...config.provisions,
                        shadeRequiredWbgtC: parseFloat(e.target.value) || 27.5,
                      },
                    })
                  }
                  className="min-h-[36px] w-full px-2 rounded bg-white border border-[#D4CBB9] font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-[#4A6857]">
                  AC Rest Required WBGT (°C)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={config.provisions.acRequiredWbgtC}
                  onChange={(e) =>
                    onUpdateConfig({
                      ...config,
                      provisions: {
                        ...config.provisions,
                        acRequiredWbgtC: parseFloat(e.target.value) || 31.5,
                      },
                    })
                  }
                  className="min-h-[36px] w-full px-2 rounded bg-white border border-[#D4CBB9] font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-[#4A6857]">
                  Restrict Trigger WBGT (°C)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={config.escalationTriggers.restrictWbgtC}
                  onChange={(e) =>
                    onUpdateConfig({
                      ...config,
                      escalationTriggers: {
                        ...config.escalationTriggers,
                        restrictWbgtC: parseFloat(e.target.value) || 29.5,
                      },
                    })
                  }
                  className="min-h-[36px] w-full px-2 rounded bg-white border border-[#D4CBB9] font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-[#4A6857]">
                  Stop Work Trigger WBGT (°C)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={config.escalationTriggers.stopWorkWbgtC}
                  onChange={(e) =>
                    onUpdateConfig({
                      ...config,
                      escalationTriggers: {
                        ...config.escalationTriggers,
                        stopWorkWbgtC: parseFloat(e.target.value) || 32.0,
                      },
                    })
                  }
                  className="min-h-[36px] w-full px-2 rounded bg-white border border-[#D4CBB9] font-mono text-xs"
                />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 3. Emergency & First Aid Escalation Card */}
      <section className="bg-[#FFF5F5] border border-[#FECACA] rounded-2xl p-4 sm:p-5 space-y-2.5">
        <div className="flex items-center justify-between gap-2 text-[#991B1B]">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <h2 className="text-sm font-extrabold">{copy.emergencyTitle}</h2>
          </div>
          <span className="font-mono font-extrabold text-xs bg-[#991B1B] text-white px-2.5 py-1 rounded-lg flex items-center gap-1">
            <PhoneCall className="w-3.5 h-3.5" />
            <span>UAE 998</span>
          </span>
        </div>

        <p className="text-xs font-semibold text-[#7F1D1D]">
          {isAr
            ? 'علامات التحذير: التعرق الشديد، الدوار، التشوش الذهني، جفاف وسخونة الجلد، الإغماء.'
            : 'Warning Signs: Heavy sweating, dizziness, confusion, hot dry skin, or fainting.'}
        </p>

        <ol className="list-decimal pl-4 rtl:pr-4 space-y-1 text-xs text-[#7F1D1D]">
          <li>
            {isAr
              ? 'أوقف العمل فوراً وانقل المصاب إلى منطقة مظللة أو مكيفة.'
              : 'Stop work immediately and move the person to a shaded or air-conditioned area.'}
          </li>
          <li>
            {isAr
              ? 'خفف معدات الوقاية الخارجية وابدأ التبريد الخارجي بالماء البارد والكمادات.'
              : 'Loosen outer gear, cool externally with wet cloths/water, and fan continuously.'}
          </li>
          <li>
            {isAr
              ? 'اتصل فوراً بمسعف الموقع أو خدمات الطوارئ في الإمارات (الإسعاف 998).'
              : 'Alert the site medic immediately and call UAE Ambulance emergency services: 998.'}
          </li>
        </ol>

        <div className="text-[11px] font-bold text-[#991B1B] pt-1 border-t border-[#FECACA]">
          {copy.disclaimerPersistent}
        </div>
      </section>

      {/* 4. Privacy by Design & Anti-Misuse Panel */}
      <section className="bg-[#F4EFE6] border border-[#DED5C5] rounded-2xl p-4 sm:p-5 space-y-2.5">
        <div className="flex items-center gap-2 text-[#173829]">
          <Lock className="w-4 h-4 shrink-0" />
          <h2 className="text-sm font-extrabold">{copy.privacyTitle}</h2>
        </div>

        <div className="space-y-1.5 text-xs text-[#2D4D3C]">
          <div>
            <strong className="text-[#173829]">Stored locally / offline PWA cache:</strong> Site coordinates, readiness checklist, crew-level acclimatization tags, zone context, anonymous incident logs, QR station counts, and last approved schedule.
          </div>
          <div>
            <strong className="text-[#173829]">Sent to AI:</strong> Hourly site forecast, anonymous crew_id / workload / exposure / zone tags, what-if simulator parameters, and UAE compliance thresholds.
          </div>
          <div>
            <strong className="text-[#173829]">Never collected:</strong> Zero worker names, ages, Emirates IDs, phone numbers, medical histories, diagnoses, or individual wearable biometrics.
          </div>
        </div>

        <div className="bg-white border border-[#D4CBB9] rounded-lg p-2.5 text-[11px] font-bold text-[#173829]">
          {copy.antiMisuseNotice}
        </div>
      </section>
    </aside>
  );
};
