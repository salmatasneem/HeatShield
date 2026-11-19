import React, { useRef, useState } from 'react';
import {
  Upload,
  FileText,
  Plus,
  Trash2,
  Database,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { ExposureType, WorkloadIntensity } from '../../config/complianceConfig';
import { AcclimatizationStatusTag, CrewRosterRow } from '../../types/occupational';
import {
  DEMO_ROSTER_ROWS,
  parseRosterCsv,
  SAMPLE_ROSTER_CSV,
} from '../../services/rosterParser';
import { DASHBOARD_COPY, DashboardLocale } from '../../services/i18n';

interface RosterIntakeBarProps {
  locale: DashboardLocale;
  roster: CrewRosterRow[];
  onChangeRoster: (rows: CrewRosterRow[], triggerReplan?: boolean) => void;
  siteRestCapacityCrews?: number;
  firstAidersOnDuty?: number;
  onChangeSiteResources?: (capacityCrews: number, firstAiders: number) => void;
}

export const RosterIntakeBar: React.FC<RosterIntakeBarProps> = ({
  locale,
  roster,
  onChangeRoster,
  siteRestCapacityCrews = 2,
  firstAidersOnDuty = 2,
  onChangeSiteResources,
}) => {
  const isAr = locale === 'ar';
  const copy = DASHBOARD_COPY[locale];
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isPasteOpen, setIsPasteOpen] = useState(false);
  const [isRosterExpanded, setIsRosterExpanded] = useState(true);
  const [csvDraft, setCsvDraft] = useState(SAMPLE_ROSTER_CSV);
  const [privacyNotice, setPrivacyNotice] = useState<string | null>(null);

  // Add anonymous crew form state
  const [newCrewId, setNewCrewId] = useState('');
  const [newTaskType, setNewTaskType] = useState('');
  const [newWorkload, setNewWorkload] = useState<WorkloadIntensity>('moderate');
  const [newExposure, setNewExposure] = useState<ExposureType>('sun');
  const [newShiftStart, setNewShiftStart] = useState('06:00');
  const [newShiftEnd, setNewShiftEnd] = useState('17:00');
  const [newCrewTag, setNewCrewTag] = useState<AcclimatizationStatusTag>('acclimatized');

  const handleParseAndApply = (text: string) => {
    const parsed = parseRosterCsv(text);
    if (parsed.rows.length > 0) {
      onChangeRoster(parsed.rows, true);
      setIsPasteOpen(false);
    }
    if (parsed.warnings.length > 0) {
      setPrivacyNotice(parsed.warnings.join(' '));
    } else {
      setPrivacyNotice(null);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      setCsvDraft(content);
      handleParseAndApply(content);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleAddRow = (e: React.FormEvent) => {
    e.preventDefault();
    const id = (newCrewId.trim() || `Crew-${String.fromCharCode(65 + roster.length)}`)
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .slice(0, 24);
    const task = newTaskType.trim() || 'Outdoor Site Assembly';

    const updated: CrewRosterRow[] = [
      ...roster,
      {
        crew_id: id,
        taskType: task,
        workload: newWorkload,
        exposure: newExposure,
        shiftStart: newShiftStart,
        shiftEnd: newShiftEnd,
        crewTag: newCrewTag,
      },
    ];
    onChangeRoster(updated, true);
    setNewCrewId('');
    setNewTaskType('');
  };

  const handleRemoveCrew = (crewId: string) => {
    if (roster.length <= 1) return;
    onChangeRoster(
      roster.filter((r) => r.crew_id !== crewId),
      true
    );
  };

  return (
    <section
      aria-label="Shift Roster Integration"
      className="bg-white border border-[#DED5C5] rounded-2xl p-4 sm:p-5 space-y-4 print:hidden"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm sm:text-base font-extrabold text-[#173829]">
              {isAr ? 'جداول الفرق الميدانية (مجهولة الهوية)' : 'Anonymized Shift Roster (Crew-Level Only)'}
            </h2>
            <span className="text-xs font-mono text-[#557564] tabular-nums">
              · {roster.length} {isAr ? 'فرق' : 'crews'}
            </span>
          </div>
          <p className="text-xs text-[#4A6857] mt-0.5">
            {isAr
              ? 'الحقول المسموحة فقط: رمز الفريق، نوع المهمة، الجهد، التعرض، بداية/نهاية المناوبة، ووسم التأقلم. بدون أي أسماء أو بيانات صحية.'
              : 'Allowed fields ONLY: crew_id, taskType, workload, exposure, shiftStart, shiftEnd, crewTag (new / returning / acclimatized).'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setPrivacyNotice(null);
              onChangeRoster(DEMO_ROSTER_ROWS, true);
            }}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#EBF5F0] hover:bg-[#DCEBE2] border border-[#C5DFD0] text-[#173829] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Database className="w-4 h-4" />
            <span>{copy.loadDemoBtn}</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#FAF8F3] hover:bg-[#EFE9DC] border border-[#D4CBB9] text-[#173829] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>{isAr ? 'رفع CSV' : 'Upload CSV'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsPasteOpen((p) => !p)}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#FAF8F3] hover:bg-[#EFE9DC] border border-[#D4CBB9] text-[#173829] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            <span>{isAr ? 'لصق جدول' : 'Paste Roster'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsRosterExpanded((p) => !p)}
            aria-expanded={isRosterExpanded}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-white hover:bg-[#FAF8F3] border border-[#DED5C5] text-[#4A6857] text-xs font-bold flex items-center gap-1 cursor-pointer"
          >
            {isRosterExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            <span>{isRosterExpanded ? (isAr ? 'طي' : 'Hide') : (isAr ? 'عرض' : 'Show')}</span>
          </button>
        </div>
      </div>

      {privacyNotice && (
        <div
          role="status"
          className="bg-[#FEF3C7] border border-[#FDE68A] text-[#92400E] rounded-xl px-3.5 py-2.5 text-xs font-semibold flex items-start gap-2"
        >
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{privacyNotice}</span>
        </div>
      )}

      {isPasteOpen && (
        <div className="bg-[#FAF8F3] border border-[#DED5C5] rounded-xl p-3.5 space-y-2.5">
          <label htmlFor="csv-paste-area" className="block text-xs font-bold text-[#173829]">
            {isAr
              ? 'الصق بيانات CSV (سيتم تجاهل أي أعمدة شخصية تلقائياً)'
              : 'Paste CSV rows (any personal columns like names, ages, or health fields are automatically stripped)'}
          </label>
          <textarea
            id="csv-paste-area"
            rows={5}
            value={csvDraft}
            onChange={(e) => setCsvDraft(e.target.value)}
            className="w-full p-2.5 rounded-lg bg-white border border-[#D4CBB9] font-mono text-xs text-[#173829]"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleParseAndApply(csvDraft)}
              className="min-h-[40px] px-4 py-2 rounded-lg bg-[#173829] text-[#FAF8F3] text-xs font-bold cursor-pointer"
            >
              {isAr ? 'استيراد وإعادة التخطيط' : 'Import & Plan'}
            </button>
            <button
              type="button"
              onClick={() => setCsvDraft(SAMPLE_ROSTER_CSV)}
              className="min-h-[40px] px-3 py-2 rounded-lg bg-white border border-[#D4CBB9] text-[#2D4D3C] text-xs font-semibold cursor-pointer"
            >
              {isAr ? 'استعادة نموذج CSV' : 'Reset Sample CSV'}
            </button>
          </div>
        </div>
      )}

      {isRosterExpanded && (
        <div className="space-y-3">
          {onChangeSiteResources && (
            <div className="flex flex-wrap items-center gap-3 bg-[#FAF8F3] border border-[#E6DFD1] rounded-xl px-3.5 py-2.5 text-xs">
              <span className="font-extrabold text-[#173829]">
                {isAr ? 'قيود السعة والموارد بالموقع:' : 'Site Shelter & Coverage Inputs:'}
              </span>
              <label className="flex items-center gap-1.5 font-semibold text-[#2D4D3C]">
                <span>{isAr ? 'سعة الاستراحة (فرق):' : 'Rest-Area Capacity (crews):'}</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={siteRestCapacityCrews}
                  onChange={(e) =>
                    onChangeSiteResources(Math.max(1, Number(e.target.value) || 1), firstAidersOnDuty)
                  }
                  className="w-16 px-2 py-1 rounded-lg bg-white border border-[#D4CBB9] font-mono font-bold text-[#173829]"
                />
              </label>
              <label className="flex items-center gap-1.5 font-semibold text-[#2D4D3C]">
                <span>{isAr ? 'المسعفون المناوبون:' : 'First-Aiders on Duty:'}</span>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={firstAidersOnDuty}
                  onChange={(e) =>
                    onChangeSiteResources(siteRestCapacityCrews, Math.max(0, Number(e.target.value) || 0))
                  }
                  className="w-16 px-2 py-1 rounded-lg bg-white border border-[#D4CBB9] font-mono font-bold text-[#173829]"
                />
              </label>
            </div>
          )}

          <div className="overflow-x-auto border border-[#E6DFD1] rounded-xl">
            <table className="w-full text-left rtl:text-right border-collapse text-xs">
              <thead>
                <tr className="bg-[#F4EFE6] text-[#4A6857] border-b border-[#E6DFD1]">
                  <th className="py-2.5 px-3 font-bold">crew_id</th>
                  <th className="py-2.5 px-3 font-bold">taskType</th>
                  <th className="py-2.5 px-3 font-bold">workload</th>
                  <th className="py-2.5 px-3 font-bold">exposure</th>
                  <th className="py-2.5 px-3 font-bold">crewTag</th>
                  <th className="py-2.5 px-3 font-bold">shiftStart – shiftEnd</th>
                  <th className="py-2.5 px-3 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFE9DC]">
                {roster.map((row) => (
                  <tr key={row.crew_id} className="hover:bg-[#FAF8F3]">
                    <td className="py-2 px-3 font-mono font-bold text-[#173829]">{row.crew_id}</td>
                    <td className="py-2 px-3 text-[#2D4D3C] font-medium">{row.taskType}</td>
                    <td className="py-2 px-3 capitalize font-semibold text-[#173829]">{row.workload}</td>
                    <td className="py-2 px-3 capitalize font-semibold text-[#173829]">{row.exposure}</td>
                    <td className="py-2 px-3 font-semibold text-[#4A6857]">
                      {(row.crewTag || 'acclimatized').replace(/_/g, ' ')}
                    </td>
                    <td className="py-2 px-3 font-mono tabular-nums text-[#2D4D3C]">
                      {row.shiftStart} – {row.shiftEnd}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemoveCrew(row.crew_id)}
                        disabled={roster.length <= 1}
                        aria-label={`Remove ${row.crew_id}`}
                        className="p-1.5 rounded-lg text-[#6C8D7B] hover:text-[#991B1B] hover:bg-[#FEE2E2] disabled:opacity-30 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Quick Add Anonymous Crew Row */}
          <form onSubmit={handleAddRow} className="grid grid-cols-2 sm:grid-cols-7 gap-2 pt-1">
            <input
              type="text"
              placeholder="crew_id (e.g. Crew-E)"
              value={newCrewId}
              onChange={(e) => setNewCrewId(e.target.value)}
              className="min-h-[40px] px-2.5 rounded-lg bg-[#FAF8F3] border border-[#D4CBB9] text-xs font-mono text-[#173829]"
            />
            <input
              type="text"
              placeholder="taskType (e.g. Masonry)"
              value={newTaskType}
              onChange={(e) => setNewTaskType(e.target.value)}
              className="min-h-[40px] px-2.5 rounded-lg bg-[#FAF8F3] border border-[#D4CBB9] text-xs text-[#173829]"
            />
            <select
              value={newWorkload}
              onChange={(e) => setNewWorkload(e.target.value as WorkloadIntensity)}
              aria-label="Workload level"
              className="min-h-[40px] px-2 rounded-lg bg-[#FAF8F3] border border-[#D4CBB9] text-xs font-semibold text-[#173829]"
            >
              <option value="light">light</option>
              <option value="moderate">moderate</option>
              <option value="heavy">heavy</option>
            </select>
            <select
              value={newExposure}
              onChange={(e) => setNewExposure(e.target.value as ExposureType)}
              aria-label="Exposure type"
              className="min-h-[40px] px-2 rounded-lg bg-[#FAF8F3] border border-[#D4CBB9] text-xs font-semibold text-[#173829]"
            >
              <option value="sun">sun</option>
              <option value="shade">shade</option>
              <option value="indoor">indoor</option>
            </select>
            <select
              value={newCrewTag}
              onChange={(e) => setNewCrewTag(e.target.value as AcclimatizationStatusTag)}
              aria-label="Crew acclimatization tag"
              className="min-h-[40px] px-2 rounded-lg bg-[#FAF8F3] border border-[#D4CBB9] text-xs font-semibold text-[#173829]"
            >
              <option value="acclimatized">acclimatized</option>
              <option value="returning_after_leave">returning</option>
              <option value="new_to_site">new to site</option>
            </select>
            <div className="flex items-center gap-1">
              <input
                type="time"
                value={newShiftStart}
                onChange={(e) => setNewShiftStart(e.target.value)}
                aria-label="Shift start"
                className="min-h-[40px] w-full px-1.5 rounded-lg bg-[#FAF8F3] border border-[#D4CBB9] text-[11px] font-mono text-[#173829]"
              />
              <input
                type="time"
                value={newShiftEnd}
                onChange={(e) => setNewShiftEnd(e.target.value)}
                aria-label="Shift end"
                className="min-h-[40px] w-full px-1.5 rounded-lg bg-[#FAF8F3] border border-[#D4CBB9] text-[11px] font-mono text-[#173829]"
              />
            </div>
            <button
              type="submit"
              className="min-h-[40px] px-3 rounded-lg bg-[#173829] hover:bg-[#24533D] text-[#FAF8F3] text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{isAr ? 'إضافة فريق' : 'Add Crew'}</span>
            </button>
          </form>
        </div>
      )}
    </section>
  );
};
