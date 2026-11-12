import React, { useState, useEffect } from 'react';
import {
  Volume2,
  VolumeX,
  Play,
  Square,
  Sparkles,
  Thermometer,
  Droplets,
  Sun,
  ShieldAlert,
  ShieldCheck,
  GlassWater,
  Languages,
  CheckCircle2,
  HelpCircle,
} from 'lucide-react';
import { RiskEvaluation, GeminiHeatAdvice, SupportedLanguage } from '../types';
import { AppLocale, UI_TRANSLATIONS } from '../utils/i18n';
import { playTtsOrFallback, stopAllSpeech } from '../utils/speech';

interface BilingualResultsAudioCardProps {
  evaluation: RiskEvaluation;
  advice: GeminiHeatAdvice;
  locale: AppLocale;
  onOpenVoiceQa: () => void;
}

export const BilingualResultsAudioCard: React.FC<BilingualResultsAudioCardProps> = ({
  evaluation,
  advice,
  locale,
  onOpenVoiceQa,
}) => {
  const t = UI_TRANSLATIONS[locale];
  const [activeTab, setActiveTab] = useState<'en' | 'ar'>(locale === 'ar' ? 'ar' : 'en');
  const [isPlayingEn, setIsPlayingEn] = useState(false);
  const [isPlayingAr, setIsPlayingAr] = useState(false);
  const [speechSpeed, setSpeechSpeed] = useState<number>(0.95);

  // Sync active reading tab if global locale changes
  useEffect(() => {
    setActiveTab(locale === 'ar' ? 'ar' : 'en');
  }, [locale]);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      stopAllSpeech();
    };
  }, []);

  const { airTemp, humidity, globeTemp, wbgt, riskLevel, safeAction, isMiddayBanActive } = evaluation;

  // Bilingual constructed text descriptions for both reading and voice readout
  const englishSpeechText = `HeatShield Safety Report. Current Wet Bulb Globe Temperature is ${wbgt.toFixed(1)} degrees Celsius, indicating ${riskLevel} heat risk. Ambient air temperature is ${airTemp.toFixed(1)} degrees with ${humidity} percent relative humidity. Direct solar radiant heat is ${globeTemp.toFixed(1)} degrees. ${
    isMiddayBanActive
      ? 'Alert: The UAE legal midday break is currently in effect from 12:30 to 3:00 PM. All outdoor work under direct sun is strictly prohibited.'
      : `Recommended protocol: ${safeAction}.`
  } Please drink 250ml of cool water every 15 to 20 minutes and rest in shaded areas.`;

  const arabicSpeechText = `تقرير درع الحرارة للسلامة الميدانية في دبي. مؤشر الحرارة الرطبة الكروية دبليو بي جي تي الحالي هو ${wbgt.toFixed(1)} درجة مئوية، ومستوى الخطر ${
    riskLevel === 'Critical'
      ? 'حرج جداً'
      : riskLevel === 'High'
      ? 'إجهاد حراري مرتفع'
      : riskLevel === 'Moderate'
      ? 'معتدل'
      : 'منخفض'
  }. درجة حرارة الجو ${airTemp.toFixed(1)} درجة مئوية، ونسبة الرطوبة ${humidity} بالمئة. ${
    isMiddayBanActive
      ? 'تنبيه عاجل: حظر العمل وقت الظهيرة وفق القانون الاتحادي مفعّل الآن بين 12:30 و 3:00 عصراً. يمنع العمل تحت أشعة الشمس.'
      : `الإجراء الوقائي: ${
          riskLevel === 'Critical'
            ? 'التوقف فوراً عن العمل المكشوف والتوجه لغرف التبريد والراحة.'
            : riskLevel === 'High'
            ? 'أخذ استراحة تبريد إلزامية في الظل وشرب الماء بانتظام.'
            : 'شرب الماء بانتظام وأخذ فترات راحة منتظمة.'
        }`
  } احرص على تناول 250 مل ماء بارد كل 15 إلى 20 دقيقة وتوجه إلى أقرب استراحة مكيفة.`;

  const handlePlayEn = async () => {
    if (isPlayingEn) {
      stopAllSpeech();
      setIsPlayingEn(false);
      return;
    }
    stopAllSpeech();
    setIsPlayingAr(false);
    setIsPlayingEn(true);

    await playTtsOrFallback(
      englishSpeechText,
      'en',
      () => setIsPlayingEn(true),
      () => setIsPlayingEn(false),
      speechSpeed
    );
  };

  const handlePlayAr = async () => {
    if (isPlayingAr) {
      stopAllSpeech();
      setIsPlayingAr(false);
      return;
    }
    stopAllSpeech();
    setIsPlayingEn(false);
    setIsPlayingAr(true);

    await playTtsOrFallback(
      arabicSpeechText,
      'ar',
      () => setIsPlayingAr(true),
      () => setIsPlayingAr(false),
      speechSpeed
    );
  };

  const handleStopAll = () => {
    stopAllSpeech();
    setIsPlayingEn(false);
    setIsPlayingAr(false);
  };

  return (
    <section
      aria-label={t.resultsAudio.title}
      className="bg-white border-2 border-[#173829]/20 rounded-3xl p-5 sm:p-6 shadow-sm hover:shadow-md transition-all space-y-5"
    >
      {/* Top Header: Title, Speech Speed, and Voice Q&A Link */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#EAE3D2]">
        <div className="flex items-center space-x-2.5 rtl:space-x-reverse">
          <div className="w-10 h-10 rounded-2xl bg-[#EBF5F0] border border-[#C5DFD0] flex items-center justify-center text-[#173829] shrink-0">
            <Volume2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2 rtl:space-x-reverse">
              <h2 className="text-base sm:text-lg font-black text-[#173829] tracking-tight">
                {t.resultsAudio.title}
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#EBF5F0] text-[#173829] border border-[#C5DFD0]">
                EN / العربية
              </span>
            </div>
            <p className="text-xs text-[#557564] font-medium">{t.resultsAudio.subtitle}</p>
          </div>
        </div>

        {/* Speed Controls & Voice Q&A shortcut */}
        <div className="flex items-center space-x-2 rtl:space-x-reverse self-start sm:self-auto">
          {/* Speech Speed selector */}
          <div className="flex items-center bg-[#F7F5EE] border border-[#D8D0BF] rounded-xl px-2.5 py-1 text-xs">
            <span className="text-[#557564] mr-1.5 rtl:mr-0 rtl:ml-1.5 font-bold">{t.resultsAudio.playbackSpeed}:</span>
            <select
              aria-label="Speech playback speed"
              value={speechSpeed}
              onChange={(e) => setSpeechSpeed(parseFloat(e.target.value))}
              className="bg-transparent font-bold text-[#173829] focus:outline-none cursor-pointer"
            >
              <option value="0.85">0.85x (Outdoor)</option>
              <option value="0.95">1.0x (Normal)</option>
              <option value="1.15">1.15x (Fast)</option>
            </select>
          </div>

          <button
            onClick={onOpenVoiceQa}
            className="flex items-center space-x-1.5 rtl:space-x-reverse px-3 py-1.5 rounded-xl bg-[#173829] hover:bg-[#24533D] text-[#FAF8F3] text-xs font-bold transition-all shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#A3E5C1]" />
            <span>{locale === 'ar' ? 'اسأل صوتياً' : 'Voice Q&A'}</span>
          </button>
        </div>
      </div>

      {/* Main Dual Audio Action Buttons (Listen in English / استمع بالعربية) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Listen in English Button */}
        <div
          className={`p-4 rounded-2xl border-2 transition-all flex flex-col justify-between space-y-3 ${
            isPlayingEn
              ? 'bg-[#EBF5F0] border-[#173829] ring-2 ring-[#173829]/20'
              : 'bg-[#FAF8F3] border-[#E5DFD3] hover:border-[#173829]/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#173829]" />
              <span className="text-xs font-black uppercase tracking-wider text-[#173829]">
                English Audio Readout
              </span>
            </div>
            {isPlayingEn && (
              <span className="flex items-center space-x-1 text-[11px] font-bold text-[#173829] animate-pulse">
                <span className="inline-block w-1.5 h-3 bg-[#173829] rounded-full animate-bounce" />
                <span className="inline-block w-1.5 h-4 bg-[#173829] rounded-full animate-bounce [animation-delay:0.15s]" />
                <span className="inline-block w-1.5 h-2 bg-[#173829] rounded-full animate-bounce [animation-delay:0.3s]" />
                <span className="ml-1">Speaking</span>
              </span>
            )}
          </div>

          <p className="text-xs text-[#4A6857] leading-relaxed line-clamp-2">
            "{englishSpeechText.slice(0, 110)}..."
          </p>

          <button
            onClick={handlePlayEn}
            aria-label={isPlayingEn ? 'Stop English audio' : 'Listen to results in English'}
            className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center space-x-2 transition-all ${
              isPlayingEn
                ? 'bg-[#C81D25] text-white shadow-sm'
                : 'bg-[#173829] hover:bg-[#24533D] text-[#FAF8F3] shadow-xs'
            }`}
          >
            {isPlayingEn ? (
              <>
                <Square className="w-4 h-4 fill-current" />
                <span>Stop English Audio</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>🔊 Hear in English</span>
              </>
            )}
          </button>
        </div>

        {/* Listen in Arabic Button */}
        <div
          dir="rtl"
          className={`p-4 rounded-2xl border-2 transition-all flex flex-col justify-between space-y-3 ${
            isPlayingAr
              ? 'bg-[#EBF5F0] border-[#173829] ring-2 ring-[#173829]/20'
              : 'bg-[#FAF8F3] border-[#E5DFD3] hover:border-[#173829]/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 space-x-reverse">
              <span className="w-2.5 h-2.5 rounded-full bg-[#173829]" />
              <span className="font-arabic-calligraphy text-xs font-black text-[#173829]">
                الاستماع الصوتي بالعربية
              </span>
            </div>
            {isPlayingAr && (
              <span className="flex items-center space-x-1 space-x-reverse text-[11px] font-bold text-[#173829] animate-pulse">
                <span className="inline-block w-1.5 h-3 bg-[#173829] rounded-full animate-bounce" />
                <span className="inline-block w-1.5 h-4 bg-[#173829] rounded-full animate-bounce [animation-delay:0.15s]" />
                <span className="inline-block w-1.5 h-2 bg-[#173829] rounded-full animate-bounce [animation-delay:0.3s]" />
                <span className="mr-1">جاري القراءة</span>
              </span>
            )}
          </div>

          <p className="text-xs text-[#4A6857] leading-relaxed line-clamp-2">
            "{arabicSpeechText.slice(0, 110)}..."
          </p>

          <button
            onClick={handlePlayAr}
            aria-label={isPlayingAr ? 'إيقاف الصوت العربي' : 'الاستماع إلى النتائج باللغة العربية'}
            className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center space-x-2 space-x-reverse transition-all ${
              isPlayingAr
                ? 'bg-[#C81D25] text-white shadow-sm'
                : 'bg-[#173829] hover:bg-[#24533D] text-[#FAF8F3] shadow-xs'
            }`}
          >
            {isPlayingAr ? (
              <>
                <Square className="w-4 h-4 fill-current" />
                <span>إيقاف الصوت</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>🔊 استمع بالعربية</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Reading Section with Tabs: Read in English / اقرأ بالعربية */}
      <div className="bg-[#FAF8F3] rounded-2xl border border-[#E5DFD3] p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#E8E1D5]">
          <div className="flex items-center space-x-2 rtl:space-x-reverse">
            <Languages className="w-4 h-4 text-[#24533D]" />
            <span className="text-xs font-black uppercase tracking-wider text-[#173829]">
              {locale === 'ar' ? 'عرض النتائج النصية للقراءة' : 'Visual Reading View'}
            </span>
          </div>

          {/* Language Toggle Pills */}
          <div className="flex items-center bg-[#EAE3D2] p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('en')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'en'
                  ? 'bg-white text-[#173829] shadow-xs'
                  : 'text-[#557564] hover:text-[#173829]'
              }`}
            >
              English (EN)
            </button>
            <button
              onClick={() => setActiveTab('ar')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'ar'
                  ? 'bg-white text-[#173829] shadow-xs'
                  : 'text-[#557564] hover:text-[#173829]'
              }`}
            >
              العربية (AR)
            </button>
          </div>
        </div>

        {/* English Content View */}
        {activeTab === 'en' ? (
          <div className="space-y-3.5 text-xs text-[#173829]">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 bg-white rounded-xl border border-[#E5DFD3]">
                <div className="text-[10px] font-bold uppercase text-[#557564]">WBGT Metric</div>
                <div className="text-lg font-black font-mono text-[#173829]">{wbgt.toFixed(1)}°C</div>
              </div>
              <div className="p-3 bg-white rounded-xl border border-[#E5DFD3]">
                <div className="text-[10px] font-bold uppercase text-[#557564]">Risk Classification</div>
                <div className="text-sm font-black text-[#C81D25]">{riskLevel.toUpperCase()}</div>
              </div>
              <div className="p-3 bg-white rounded-xl border border-[#E5DFD3]">
                <div className="text-[10px] font-bold uppercase text-[#557564]">Air Temp & Humidity</div>
                <div className="text-sm font-black font-mono">{airTemp.toFixed(1)}°C | {humidity}%</div>
              </div>
              <div className="p-3 bg-white rounded-xl border border-[#E5DFD3]">
                <div className="text-[10px] font-bold uppercase text-[#557564]">Midday Ban</div>
                <div className="text-sm font-black text-[#173829]">
                  {isMiddayBanActive ? 'ACTIVE (12:30-15:00)' : 'Inactive'}
                </div>
              </div>
            </div>

            <div className="p-3.5 bg-white rounded-xl border border-[#E5DFD3] space-y-2">
              <div className="font-extrabold text-[#173829] flex items-center space-x-1.5">
                <CheckCircle2 className="w-4 h-4 text-[#24533D]" />
                <span>Actionable Occupational Safety Directives:</span>
              </div>
              <p className="text-xs text-[#2D4D3C] leading-relaxed">
                {safeAction} • Mandatory 250ml cool water every 15-20 min • Continuous buddy supervision.
              </p>
              <p className="text-[11px] text-[#557564] italic">
                {advice.explanation}
              </p>
            </div>
          </div>
        ) : (
          /* Arabic Content View */
          <div dir="rtl" className="space-y-3.5 text-xs text-[#173829]">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 bg-white rounded-xl border border-[#E5DFD3]">
                <div className="text-[10px] font-bold uppercase text-[#557564]">مؤشر WBGT الحراري</div>
                <div className="text-lg font-black font-mono text-[#173829]">{wbgt.toFixed(1)}°م</div>
              </div>
              <div className="p-3 bg-white rounded-xl border border-[#E5DFD3]">
                <div className="text-[10px] font-bold uppercase text-[#557564]">تصنيف مستوى الخطر</div>
                <div className="text-sm font-black text-[#C81D25]">
                  {riskLevel === 'Critical'
                    ? 'خطر حرج جداً'
                    : riskLevel === 'High'
                    ? 'إجهاد حراري مرتفع'
                    : 'معتدل'}
                </div>
              </div>
              <div className="p-3 bg-white rounded-xl border border-[#E5DFD3]">
                <div className="text-[10px] font-bold uppercase text-[#557564]">الحرارة والرطوبة</div>
                <div className="text-sm font-black font-mono">{airTemp.toFixed(1)}°م | {humidity}%</div>
              </div>
              <div className="p-3 bg-white rounded-xl border border-[#E5DFD3]">
                <div className="text-[10px] font-bold uppercase text-[#557564]">حظر الظهيرة</div>
                <div className="text-sm font-black text-[#173829]">
                  {isMiddayBanActive ? 'مفعّل إلزامياً (12:30 - 3:00)' : 'غير مفعّل الآن'}
                </div>
              </div>
            </div>

            <div className="p-3.5 bg-white rounded-xl border border-[#E5DFD3] space-y-2">
              <div className="font-extrabold text-[#173829] flex items-center space-x-1.5 space-x-reverse">
                <CheckCircle2 className="w-4 h-4 text-[#24533D]" />
                <span>الإجراءات الوقائية الواجب اتباعها ميدانياً:</span>
              </div>
              <p className="text-xs text-[#2D4D3C] leading-relaxed">
                {riskLevel === 'Critical'
                  ? 'التوقف الفوري عن كافة الأعمال تحت أشعة الشمس والتوجه إلى غرف التبريد والراحة.'
                  : 'تناول 250 مل ماء بارد كل 15 دقيقة، أخذ فترات راحة منتظمة في الظل، وإبلاغ المشرف فور الشعور بأي تعب.'}
              </p>
              <p className="text-[11px] text-[#557564] leading-relaxed">
                تم احتساب النتائج بناءً على معايير المنظمة الدولية ISO 7243 وقرارات وزارة الموارد البشرية والتوطين في دولة الإمارات العربية المتحدة لحماية صحة العاملين.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
