import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  QrCode,
  Download,
  Printer,
  RefreshCw,
  Trash2,
  Umbrella,
  CheckCircle2,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Copy,
  Check,
  X,
} from 'lucide-react';
import { AppLocale } from '../../utils/i18n';
import {
  CrewRosterRow,
  RestStationConfig,
  ShadeCheckInRecord,
  ShadeCoolingType,
  SitePreset,
} from '../../types/occupational';
import {
  buildRestStationsForSite,
  buildStationCheckInUrl,
  summarizeRegistryByStation,
} from '../../services/shadeRegistryService';

interface ShadeStationQrCardProps {
  locale: AppLocale;
  selectedSite: SitePreset;
  roster: CrewRosterRow[];
  registryEntries: ShadeCheckInRecord[];
  isRefreshingRegistry: boolean;
  onRefreshRegistry: () => void;
  onClearRegistry: (stationId?: string) => void;
  onSimulateQrScan: (station: RestStationConfig) => void;
}

const COOLING_TYPE_LABELS: Record<ShadeCoolingType, { en: string; ar: string }> = {
  ac_hall: { en: 'AC Rest Hall', ar: 'قاعة استراحة مكيفة' },
  misting_tent: { en: 'Misting Shelter', ar: 'خيمة رذاذ وتبريد' },
  shaded_canopy: { en: 'Shaded Canopy', ar: 'مظلة استراحة' },
};

export const ShadeStationQrCard: React.FC<ShadeStationQrCardProps> = ({
  locale,
  selectedSite,
  roster,
  registryEntries,
  isRefreshingRegistry,
  onRefreshRegistry,
  onClearRegistry,
  onSimulateQrScan,
}) => {
  const isAr = locale === 'ar';
  const presetStations = useMemo(() => buildRestStationsForSite(selectedSite), [selectedSite]);

  const [selectedPresetId, setSelectedPresetId] = useState<string>(presetStations[0].stationId);
  const [stationId, setStationId] = useState<string>(presetStations[0].stationId);
  const [stationName, setStationName] = useState<string>(presetStations[0].stationName);
  const [coolingType, setCoolingType] = useState<ShadeCoolingType>(presetStations[0].coolingType);
  const [defaultCrewId, setDefaultCrewId] = useState<string>('');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [showPosterModal, setShowPosterModal] = useState(false);

  const activeStation: RestStationConfig = useMemo(
    () => ({
      stationId: stationId.trim() || 'SHADE-A1',
      stationName: stationName.trim() || 'Shaded Rest Station',
      siteId: selectedSite.id,
      siteName: selectedSite.name,
      coolingType,
      defaultCrewId: defaultCrewId || undefined,
    }),
    [stationId, stationName, selectedSite, coolingType, defaultCrewId]
  );

  const origin =
    typeof window !== 'undefined' && window.location.origin
      ? window.location.origin
      : 'https://heatshield.local';

  const encodedUrl = useMemo(
    () => buildStationCheckInUrl(activeStation, origin),
    [activeStation, origin]
  );

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(encodedUrl, {
      width: 320,
      margin: 2,
      color: {
        dark: '#173829',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      });

    return () => {
      active = false;
    };
  }, [encodedUrl]);

  const handleSelectPreset = (id: string) => {
    setSelectedPresetId(id);
    if (id === 'custom') return;
    const found = presetStations.find((p) => p.stationId === id);
    if (found) {
      setStationId(found.stationId);
      setStationName(found.stationName);
      setCoolingType(found.coolingType);
    }
  };

  const handleDownloadPosterPng = () => {
    if (!qrDataUrl) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 720;
      canvas.height = 920;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Cream & emerald HeatShield station poster background
      ctx.fillStyle = '#FAF8F3';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Header bar
      ctx.fillStyle = '#173829';
      ctx.fillRect(0, 0, canvas.width, 160);

      ctx.fillStyle = '#A3E5C1';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('HEATSHIELD AI · SHADY AREA REGISTRY', canvas.width / 2, 54);

      ctx.fillStyle = '#FAF8F3';
      ctx.font = 'bold 34px sans-serif';
      ctx.fillText(activeStation.stationName.slice(0, 34), canvas.width / 2, 102);

      ctx.fillStyle = '#D7E6DD';
      ctx.font = '18px monospace';
      ctx.fillText(`STATION ID: ${activeStation.stationId} · ${selectedSite.name}`, canvas.width / 2, 136);

      // QR card
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#173829';
      ctx.lineWidth = 4;
      ctx.fillRect(140, 200, 440, 440);
      ctx.strokeRect(140, 200, 440, 440);
      ctx.drawImage(img, 165, 225, 390, 390);

      // Instructions below QR
      ctx.fillStyle = '#173829';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText('SCAN FOR INSTANT SHADE CHECK-IN', canvas.width / 2, 700);

      ctx.fillStyle = '#24533D';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('امسح الرمز لتسجيل الوصول الفوري إلى منطقة الظل', canvas.width / 2, 742);

      ctx.fillStyle = '#426050';
      ctx.font = '18px sans-serif';
      ctx.fillText('Zero typing · Crew-level log only · No personal names required', canvas.width / 2, 795);

      if (activeStation.defaultCrewId) {
        ctx.fillStyle = '#173829';
        ctx.font = 'bold 20px monospace';
        ctx.fillText(`PRE-LINKED CREW: ${activeStation.defaultCrewId}`, canvas.width / 2, 845);
      }

      const link = document.createElement('a');
      link.download = `HeatShield-RestStation-${activeStation.stationId}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = qrDataUrl;
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(encodedUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // ignore clipboard restriction
    }
  };

  const stationSummaries = useMemo(
    () => summarizeRegistryByStation(registryEntries),
    [registryEntries]
  );

  const crewOptions = useMemo(() => {
    const ids = Array.from(new Set(roster.map((r) => r.crew_id).filter(Boolean)));
    return ids.length > 0 ? ids : ['Crew-A', 'Crew-B', 'Crew-C'];
  }, [roster]);

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso.slice(11, 16);
    }
  };

  return (
    <div className="bg-white border border-[#e5dfd3] rounded-2xl p-5 sm:p-6 shadow-xs hover:shadow-md transition-shadow space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#ece6da]">
        <div className="flex items-center space-x-2.5 rtl:space-x-reverse">
          <div className="p-2.5 rounded-xl bg-[#edf4f0] text-[#173829]">
            <QrCode className="w-5 h-5 text-[#173829]" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-extrabold text-base text-[#173829]">
                {isAr
                  ? 'مولد رمز QR لمحطات الاستراحة وسجل منطقة الظل'
                  : 'Rest Station QR Generator & Shady Area Registry'}
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#edf4f0] text-[#173829] border border-[#c3d9cd]">
                {isAr ? 'تسجيل بدون كتابة' : 'Zero-Typing Worker Check-In'}
              </span>
            </div>
            <p className="text-xs text-[#426050] mt-0.5">
              {isAr
                ? 'اطبع رمز QR أو اعرضه عند محطات التبريد ليمسحه العمال ويسجلوا دخولهم الفوري دون إدخال أي أسماء أو بيانات شخصية.'
                : 'Display or print this QR poster at shaded/AC rest stations so workers check into the shady area registry with a single scan—zero typing, zero personal data.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onSimulateQrScan(activeStation)}
          className="px-3.5 py-2 rounded-xl bg-[#173829] hover:bg-[#24533d] text-[#FAF8F3] text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer shrink-0 print:hidden"
        >
          <ScanLine className="w-4 h-4 text-[#A3E5C1]" />
          <span>{isAr ? 'محاكاة مسح QR (واجهة العامل)' : 'Test QR Scan (Worker View)'}</span>
        </button>
      </div>

      {/* 2-Column Layout: Left = Generator & Poster Preview, Right = Live Shady Area Registry */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Configuration & QR Preview */}
        <div className="lg:col-span-6 space-y-4">
          <div className="bg-[#f7f5ee] border border-[#e2dcd0] rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-[#426050] mb-1">
                  {isAr ? 'اختر محطة استراحة' : 'Rest Station Preset'}
                </label>
                <select
                  value={selectedPresetId}
                  onChange={(e) => handleSelectPreset(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#d8d0bf] text-xs font-bold text-[#173829] cursor-pointer"
                >
                  {presetStations.map((st) => (
                    <option key={st.stationId} value={st.stationId}>
                      {st.stationId} — {st.stationName}
                    </option>
                  ))}
                  <option value="custom">
                    {isAr ? 'محطة مخصصة...' : 'Custom Rest Station...'}
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#426050] mb-1">
                  {isAr ? 'تحديد مسبق للفريق (اختياري)' : 'Pre-Assign Crew (Instant Auto Check-In)'}
                </label>
                <select
                  value={defaultCrewId}
                  onChange={(e) => setDefaultCrewId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#d8d0bf] text-xs font-bold text-[#173829] cursor-pointer"
                >
                  <option value="">
                    {isAr ? 'أي فريق (ضغطة سريعة على الهاتف)' : 'Any Crew (1-Tap Crew Button on Phone)'}
                  </option>
                  {crewOptions.map((c) => (
                    <option key={c} value={c}>
                      {c} ({isAr ? 'تسجيل فوري تلقائي' : 'Auto-logs on scan'})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[10px] font-bold text-[#426050] mb-1">
                  {isAr ? 'رمز المحطة' : 'Station Code'}
                </label>
                <input
                  type="text"
                  value={stationId}
                  onChange={(e) => {
                    setSelectedPresetId('custom');
                    setStationId(e.target.value.slice(0, 24));
                  }}
                  placeholder="SHADE-A1"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-[#d8d0bf] text-xs font-mono font-bold text-[#173829]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[10px] font-bold text-[#426050] mb-1">
                  {isAr ? 'اسم منطقة الظل' : 'Station Display Name'}
                </label>
                <input
                  type="text"
                  value={stationName}
                  onChange={(e) => {
                    setSelectedPresetId('custom');
                    setStationName(e.target.value.slice(0, 70));
                  }}
                  placeholder="Shade Bay A1 · AC Rest Hall"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-[#d8d0bf] text-xs font-semibold text-[#173829]"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] font-bold text-[#426050]">
                {isAr ? 'نوع التبريد:' : 'Facility Type:'}
              </span>
              {(['ac_hall', 'misting_tent', 'shaded_canopy'] as ShadeCoolingType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setCoolingType(type)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                    coolingType === type
                      ? 'bg-[#173829] text-[#FAF8F3] border-[#173829]'
                      : 'bg-white text-[#426050] border-[#d8d0bf] hover:bg-[#edf4f0]'
                  }`}
                >
                  {isAr ? COOLING_TYPE_LABELS[type].ar : COOLING_TYPE_LABELS[type].en}
                </button>
              ))}
            </div>
          </div>

          {/* Generated Scannable QR Card */}
          <div className="bg-[#FAF8F3] border-2 border-[#173829] rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-4">
            <div className="bg-white p-2.5 rounded-xl border border-[#d8d0bf] shadow-xs shrink-0">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`QR Code for ${activeStation.stationName}`}
                  className="w-40 h-40 object-contain block"
                />
              ) : (
                <div className="w-40 h-40 flex items-center justify-center text-xs text-[#426050]">
                  Generating QR...
                </div>
              )}
            </div>

            <div className="flex-1 space-y-2.5 text-center sm:text-start min-w-0 w-full">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#173829] text-[#A3E5C1] text-[10px] font-bold">
                <Umbrella className="w-3 h-3" />
                <span>{activeStation.stationId}</span>
              </div>

              <h4 className="text-sm font-black text-[#173829] leading-snug break-words">
                {activeStation.stationName}
              </h4>

              <p className="text-[11px] text-[#426050] leading-relaxed">
                {isAr
                  ? 'يمسح العامل هذا الرمز بكاميرا الهاتف للدخول المباشر وتأكيد الراحة في الظل دون أي كتابة.'
                  : 'Workers point any phone camera here to check into the shady area registry instantly with zero typing.'}
              </p>

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1 print:hidden">
                <button
                  type="button"
                  onClick={handleDownloadPosterPng}
                  disabled={!qrDataUrl}
                  className="px-3 py-1.5 rounded-xl bg-[#173829] hover:bg-[#24533d] text-[#FAF8F3] text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{isAr ? 'تحميل ملصق PNG' : 'Download Poster PNG'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowPosterModal(true)}
                  className="px-3 py-1.5 rounded-xl bg-white hover:bg-[#edf4f0] border border-[#d8d0bf] text-[#173829] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{isAr ? 'معاينة للطباعة' : 'Print Poster'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-[#edf4f0] border border-[#d8d0bf] text-[#173829] text-xs font-bold flex items-center gap-1 cursor-pointer"
                  title={encodedUrl}
                >
                  {copiedUrl ? <Check className="w-3.5 h-3.5 text-[#166534]" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedUrl ? (isAr ? 'تم النسخ' : 'Copied') : (isAr ? 'نسخ الرابط' : 'Copy Link')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Live Shady Area Registry */}
        <div className="lg:col-span-6 space-y-3">
          <div className="bg-[#f7f5ee] border border-[#e2dcd0] rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-black text-[#173829] flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-[#166534]" />
                  <span>{isAr ? 'سجل منطقة الظل المباشر' : 'Live Shady Area Registry'}</span>
                </h4>
                <p className="text-[11px] text-[#426050]">
                  {isAr
                    ? 'إجمالي حالات تسجيل الدخول المجهولة خلال اليوم'
                    : 'Real-time anonymized shade arrivals across active stations'}
                </p>
              </div>

              <div className="flex items-center gap-1.5 print:hidden">
                <button
                  type="button"
                  onClick={onRefreshRegistry}
                  disabled={isRefreshingRegistry}
                  className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-[#edf4f0] border border-[#d8d0bf] text-[11px] font-bold text-[#173829] flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isRefreshingRegistry ? 'animate-spin' : ''}`} />
                  <span>{isAr ? 'تحديث' : 'Refresh'}</span>
                </button>
                {registryEntries.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onClearRegistry()}
                    className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-[#fee2e2] border border-[#fca5a5] text-[11px] font-bold text-[#991b1b] flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>{isAr ? 'مسح السجل' : 'Clear'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Summary KPI row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div className="bg-white border border-[#e5dfd3] rounded-xl p-2.5">
                <div className="text-[10px] font-bold uppercase text-[#426050]">
                  {isAr ? 'إجمالي التسجيلات' : 'Total Check-Ins'}
                </div>
                <div className="text-xl font-black font-mono text-[#173829]">
                  {registryEntries.length}
                </div>
              </div>
              <div className="bg-white border border-[#e5dfd3] rounded-xl p-2.5">
                <div className="text-[10px] font-bold uppercase text-[#426050]">
                  {isAr ? 'المحطات النشطة' : 'Active Stations'}
                </div>
                <div className="text-xl font-black font-mono text-[#173829]">
                  {stationSummaries.length}
                </div>
              </div>
              <div className="col-span-2 sm:col-span-1 bg-[#edf4f0] border border-[#c3d9cd] rounded-xl p-2.5">
                <div className="text-[10px] font-bold uppercase text-[#173829]">
                  {isAr ? 'الخصوصية' : 'Privacy Status'}
                </div>
                <div className="text-xs font-black text-[#173829] mt-1 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#166534]" />
                  <span>Zero PII / Crew Only</span>
                </div>
              </div>
            </div>

            {/* Station Breakdown Badges */}
            {stationSummaries.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {stationSummaries.map((st) => (
                  <span
                    key={st.stationId}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-[#d8d0bf] text-[11px] font-bold text-[#173829]"
                  >
                    <span className="font-mono text-[#24533D]">{st.stationId}</span>
                    <span className="text-[#426050]">·</span>
                    <span>{st.count} {isAr ? 'مسح' : 'check-ins'}</span>
                  </span>
                ))}
              </div>
            )}

            {/* Recent Check-In Feed */}
            <div className="bg-white border border-[#e5dfd3] rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-[#edf4f0]/60 border-b border-[#e5dfd3] text-[11px] font-bold text-[#173829] flex items-center justify-between">
                <span>{isAr ? 'أحدث تسجيلات الدخول (دون أسماء)' : 'Recent Shady Area Check-Ins (Crew-Level)'}</span>
                <span className="font-mono text-[10px] text-[#426050]">
                  {registryEntries.length === 0 ? 'Awaiting scans' : `Showing ${Math.min(registryEntries.length, 6)} of ${registryEntries.length}`}
                </span>
              </div>

              {registryEntries.length === 0 ? (
                <div className="p-5 text-center space-y-1.5">
                  <Sparkles className="w-5 h-5 text-[#24533D] mx-auto" />
                  <div className="text-xs font-bold text-[#173829]">
                    {isAr ? 'لا توجد تسجيلات بعد لهذه المناوبة.' : 'No shade check-ins logged yet for this shift.'}
                  </div>
                  <p className="text-[11px] text-[#426050]">
                    {isAr
                      ? 'امسح رمز QR بكاميرا الهاتف أو اضغط على زر «محاكاة مسح QR» أعلاه للتجربة الفورية.'
                      : 'Scan the QR code with a mobile phone or click "Test QR Scan (Worker View)" above to log an instant zero-typing arrival.'}
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-[#ece6da] max-h-56 overflow-y-auto">
                  {registryEntries.slice(0, 8).map((entry) => (
                    <li
                      key={entry.id}
                      className="px-3 py-2 flex items-center justify-between gap-2 text-xs hover:bg-[#FAF8F3]"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="px-2 py-0.5 rounded-md bg-[#edf4f0] border border-[#c3d9cd] text-[#173829] font-mono font-bold text-[11px] shrink-0">
                          {entry.crew_id}
                        </span>
                        <div className="truncate">
                          <span className="font-bold text-[#173829]">{entry.stationName}</span>{' '}
                          <span className="font-mono text-[10px] text-[#426050]">({entry.stationId})</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="px-1.5 py-0.5 rounded bg-[#f7f5ee] border border-[#e2dcd0] text-[10px] font-semibold text-[#426050]">
                          {entry.method === 'qr_scan' ? 'QR Scan' : 'Quick Tap'}
                        </span>
                        <span className="font-mono font-bold text-[11px] text-[#173829]">
                          {formatTime(entry.checkedInAtIso)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Print-Friendly Station Poster Modal (no window.open / window.alert) */}
      {showPosterModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FAF8F3] border-2 border-[#173829] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl text-center relative">
            <button
              type="button"
              onClick={() => setShowPosterModal(false)}
              className="absolute top-3 right-3 p-1.5 rounded-lg bg-white border border-[#d8d0bf] text-[#173829] hover:bg-[#edf4f0] print:hidden cursor-pointer"
              aria-label="Close poster preview"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="bg-[#173829] text-[#FAF8F3] rounded-xl p-4 space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#A3E5C1]">
                HeatShield AI · UAE Rest Station Poster
              </div>
              <h3 className="text-lg font-black">{activeStation.stationName}</h3>
              <div className="text-xs font-mono text-[#D7E6DD]">
                {activeStation.stationId} · {selectedSite.name}
              </div>
            </div>

            <div className="bg-white border-2 border-[#173829] rounded-2xl p-4 inline-block mx-auto">
              {qrDataUrl && (
                <img
                  src={qrDataUrl}
                  alt={`Printable QR for ${activeStation.stationName}`}
                  className="w-56 h-56 mx-auto"
                />
              )}
            </div>

            <div className="space-y-1">
              <p className="text-sm font-black text-[#173829]">
                Scan for Instant Shady Area Check-In
              </p>
              <p className="text-sm font-bold text-[#24533D]" dir="rtl">
                امسح الرمز لتسجيل الوصول الفوري إلى منطقة الظل
              </p>
              <p className="text-[11px] text-[#426050]">
                No typing required · Crew-level log only · No worker names collected
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 pt-2 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl bg-[#173829] hover:bg-[#24533d] text-[#FAF8F3] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print Now</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadPosterPng}
                className="px-4 py-2 rounded-xl bg-white hover:bg-[#edf4f0] border border-[#d8d0bf] text-[#173829] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download PNG</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
