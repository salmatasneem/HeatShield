import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  Clock,
  Droplets,
  Umbrella,
  ShieldAlert,
  Volume2,
  Printer,
  QrCode,
  Square,
} from 'lucide-react';
import {
  CrewRosterRow,
  RestStationConfig,
  SchedulePlanResult,
  WorkerLanguageCode,
} from '../types/occupational';
import { WORKER_VIEW_LABELS } from '../services/i18n';
import { RiskEvaluation } from '../types';

interface WorkerSimpleCardPanelProps {
  evaluation: RiskEvaluation;
  roster: CrewRosterRow[];
  coordinatorPlan?: SchedulePlanResult;
  stations: RestStationConfig[];
  initialCrewId?: string;
}

export const WorkerSimpleCardPanel: React.FC<WorkerSimpleCardPanelProps> = ({
  evaluation,
  roster,
  coordinatorPlan,
  stations,
  initialCrewId,
}) => {
  const crewOptions = useMemo(() => {
    const list = Array.from(new Set(roster.map((r) => r.crew_id).filter(Boolean)));
    return list.length > 0 ? list : ['Crew-A', 'Crew-B', 'Crew-C'];
  }, [roster]);

  const [crewId, setCrewId] = useState<string>(initialCrewId || crewOptions[0]);
  const [lang, setLang] = useState<WorkerLanguageCode>('en');
  const [gateQrUrl, setGateQrUrl] = useState<string>('');
  const [isSpeaking, setIsSpeaking] = useState(false);

  const labels = WORKER_VIEW_LABELS[lang];
  const crewBlocks = useMemo(
    () =>
      (coordinatorPlan?.blocks || []).filter((b) => b.crew_id === crewId),
    [coordinatorPlan, crewId]
  );

  const restWindows = useMemo(() => {
    const breaks = crewBlocks.filter((b) => b.restMinutes > 0);
    if (breaks.length === 0) return ['12:30 – 15:00 (Midday Break)'];
    return breaks.slice(0, 4).map((b) => `${b.timeRange} (${b.restMinutes}m rest)`);
  }, [crewBlocks]);

  const waterCadenceMins =
    evaluation.riskLevel === 'Critical'
      ? 15
      : evaluation.riskLevel === 'High'
      ? 20
      : evaluation.riskLevel === 'Moderate'
      ? 30
      : 45;

  const gateLink = useMemo(() => {
    const origin =
      typeof window !== 'undefined' && window.location.origin
        ? window.location.origin
        : 'https://heatshield.local';
    const params = new URLSearchParams({
      checkin: '1',
      station: 'GATE-ENTRY',
      stationName: `Site Gate · ${crewId} Schedule`,
      crew: crewId,
    });
    return `${origin}/?${params.toString()}`;
  }, [crewId]);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(gateLink, {
      width: 180,
      margin: 1,
      color: { dark: '#173829', light: '#FFFFFF' },
    })
      .then((u) => {
        if (active) setGateQrUrl(u);
      })
      .catch(() => {
        if (active) setGateQrUrl('');
      });
    return () => {
      active = false;
    };
  }, [gateLink]);

  const handleVoiceSpeak = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    window.speechSynthesis.cancel();
    const spokenText =
      lang === 'ar'
        ? `${crewId}. مستوى الخطر ${evaluation.riskLevel}. ${labels.hydrateLabel} ${labels.middayBreakLabel}`
        : `${crewId}. Today's risk level is ${evaluation.riskLevel}. Drink 250 ml cool water every ${waterCadenceMins} minutes. Mandatory midday break 12:30 to 15:00.`;
    const utter = new SpeechSynthesisUtterance(spokenText);
    utter.lang = lang === 'ar' ? 'ar-AE' : lang === 'hi' ? 'hi-IN' : lang === 'ur' ? 'ur-PK' : 'en-US';
    utter.onstart = () => setIsSpeaking(true);
    utter.onend = () => setIsSpeaking(false);
    utter.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utter);
  };

  return (
    <section
      dir={labels.dir}
      className="bg-white border-2 border-[#173829] rounded-2xl p-5 sm:p-6 shadow-xs space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#ece6da]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[#173829] text-[#A3E5C1] uppercase">
              Read-Only · No Login
            </span>
            <h3 className="text-base sm:text-lg font-black text-[#173829]">
              {labels.activeNoticeTitle} ({crewId})
            </h3>
          </div>
          <p className="text-xs text-[#426050] mt-0.5">
            {labels.noIndividualTrackingNote}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 print:hidden">
          {crewOptions.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCrewId(c)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black border cursor-pointer ${
                crewId === c
                  ? 'bg-[#173829] text-[#FAF8F3] border-[#173829]'
                  : 'bg-[#f7f5ee] text-[#173829] border-[#d8d0bf]'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Language selector + Audio / Gate Print */}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex flex-wrap gap-1.5">
          {(['en', 'ar', 'hi', 'ur'] as WorkerLanguageCode[]).map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLang(code)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                lang === code
                  ? 'bg-[#24533d] text-[#FAF8F3] border-[#24533d]'
                  : 'bg-[#f7f5ee] text-[#173829] border-[#d8d0bf]'
              }`}
            >
              {WORKER_VIEW_LABELS[code].langName}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleVoiceSpeak}
            className="px-3.5 py-2 rounded-xl bg-[#173829] hover:bg-[#24533d] text-[#FAF8F3] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            {isSpeaking ? <Square className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 text-[#A3E5C1]" />}
            <span>{isSpeaking ? 'Stop Voice' : `Play Voice (${lang.toUpperCase()})`}</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-2 rounded-xl bg-[#f7f5ee] hover:bg-[#eae4d5] border border-[#d8d0bf] text-[#173829] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Gate Poster</span>
          </button>
        </div>
      </div>

      {/* Large-Text Icon Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-[#f7f5ee] border border-[#d8d0bf] rounded-2xl p-4 space-y-1.5">
          <div className="flex items-center gap-2 text-[#173829] font-extrabold text-xs uppercase">
            <ShieldAlert className="w-5 h-5 text-[#C81D25]" />
            <span>Today&apos;s Risk</span>
          </div>
          <div className="text-2xl font-black text-[#173829]">{evaluation.riskLevel}</div>
          <div className="text-xs font-mono font-bold text-[#426050]">
            Est. WBGT: {evaluation.wbgt.toFixed(1)}°C
          </div>
        </div>

        <div className="bg-[#edf4f0] border border-[#c3d9cd] rounded-2xl p-4 space-y-1.5">
          <div className="flex items-center gap-2 text-[#173829] font-extrabold text-xs uppercase">
            <Clock className="w-5 h-5 text-[#173829]" />
            <span>Rest Times</span>
          </div>
          <div className="space-y-1 text-xs font-bold text-[#173829]">
            {restWindows.map((rw, idx) => (
              <div key={idx}>{rw}</div>
            ))}
          </div>
        </div>

        <div className="bg-[#eff6ff] border border-[#bfdbfe] rounded-2xl p-4 space-y-1.5">
          <div className="flex items-center gap-2 text-[#1e3a8a] font-extrabold text-xs uppercase">
            <Droplets className="w-5 h-5 text-[#2563eb]" />
            <span>Water Breaks</span>
          </div>
          <div className="text-lg font-black text-[#1e3a8a]">
            250 ml / {waterCadenceMins} min
          </div>
          <div className="text-xs text-[#1e40af] font-semibold">{labels.hydrateLabel}</div>
        </div>

        <div className="bg-[#FAF8F3] border border-[#d8d0bf] rounded-2xl p-4 flex items-center gap-3">
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-1.5 text-[#173829] font-extrabold text-xs uppercase">
              <Umbrella className="w-4 h-4 text-[#24533d]" />
              <span>Shade Hubs & Gate QR</span>
            </div>
            <div className="text-[11px] font-bold text-[#24533d] space-y-0.5">
              {stations.slice(0, 2).map((s) => (
                <div key={s.stationId}>• {s.stationName}</div>
              ))}
            </div>
          </div>
          {gateQrUrl ? (
            <img
              src={gateQrUrl}
              alt={`Gate QR for ${crewId}`}
              className="w-16 h-16 rounded-lg border border-[#173829] bg-white p-0.5 shrink-0"
            />
          ) : (
            <QrCode className="w-12 h-12 text-[#173829] shrink-0" />
          )}
        </div>
      </div>

      {/* Warning Signs: Stop and Report Card (Non-medical emergency escalation) */}
      <div
        role="alert"
        className="bg-[#FFF5F5] border-2 border-[#C81D25] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#7F1D1D]"
      >
        <div className="space-y-1.5">
          <div className="font-black text-sm text-[#991B1B] flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-[#C81D25] shrink-0" />
            <span>{labels.stopSignTitle}</span>
          </div>
          <ul className="font-bold space-y-0.5 list-disc list-inside">
            {labels.stopSignsList.map((sign, i) => (
              <li key={i}>{sign}</li>
            ))}
          </ul>
          <p className="text-[11px] font-semibold text-[#991B1B]">
            Automated environmental guidance only. Not a medical diagnosis or treatment.
          </p>
        </div>
        <span className="px-3.5 py-2 rounded-xl bg-[#991B1B] text-white font-mono font-black text-sm shrink-0 text-center">
          {labels.call998Label}
        </span>
      </div>
    </section>
  );
};
