import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  HardHat,
  Bike,
  Users,
  Mic,
  Volume2,
  Square,
  Thermometer,
  Droplets,
  Sun,
  ShieldAlert,
  ShieldCheck,
  Clock,
  BookOpen,
  TrendingUp,
  MapPin,
  HeartHandshake,
  Award,
  Sparkles,
  RotateCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { RiskEvaluation, Role } from '../types';
import { AppLocale, UI_TRANSLATIONS } from '../utils/i18n';
import { evaluateHeatRisk } from '../utils/riskEngine';
import { playTtsOrFallback, stopAllSpeech } from '../utils/speech';
import { DubaiSkyline } from './DubaiSkyline';
import { Footer } from './Footer';

interface LandingPageProps {
  evaluation: RiskEvaluation;
  locale: AppLocale;
  onSetLocale: (locale: AppLocale) => void;
  initialRole: Role;
  onContinueAsGuest: (selectedRole: Role) => void;
  onOpenVoiceQa: () => void;
  onOpenEvidence: () => void;
  onOpenImpact: () => void;
  onOpenTeam: () => void;
}

interface HeroDeckCard {
  id: string;
  role: Role;
  image: string;
  alt: string;
  titleEn: string;
  titleAr: string;
  subtitleEn: string;
  subtitleAr: string;
  statLabel: string;
  statValue: string;
  accentBg: string;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  evaluation,
  locale,
  onSetLocale,
  initialRole,
  onContinueAsGuest,
  onOpenVoiceQa,
  onOpenEvidence,
  onOpenImpact,
  onOpenTeam,
}) => {
  const t = UI_TRANSLATIONS[locale];
  const isAr = locale === 'ar';
  const prefersReducedMotion = useReducedMotion();

  const [selectedRole, setSelectedRole] = useState<Role>(initialRole);
  const [activeCardIdx, setActiveCardIdx] = useState<number>(0);
  const [activeFeatureIdx, setActiveFeatureIdx] = useState<number>(0);
  const [featureDirection, setFeatureDirection] = useState<number>(1);
  const [previewPreset, setPreviewPreset] = useState<'morning' | 'current' | 'peak'>('current');
  const [playingSampleLang, setPlayingSampleLang] = useState<'en' | 'ar' | null>(null);

  useEffect(() => {
    return () => {
      stopAllSpeech();
    };
  }, []);

  // Keep hero flying deck synced when user picks a role
  const handleSelectRole = (role: Role) => {
    setSelectedRole(role);
    const matchingIdx = role === 'worker' ? 0 : role === 'rider' ? 1 : 2;
    setActiveCardIdx(matchingIdx);
  };

  // Compute live preview evaluation based on preset selector
  const previewEval =
    previewPreset === 'morning'
      ? evaluateHeatRisk({
          airTemp: 31.5,
          humidity: 44,
          globeTemp: 35.0,
          sunExposure: 'partial',
          workload: 'Moderate',
          acclimatized: true,
          heavyPPE: false,
          exposureHours: 1,
          isNewWorker: false,
          symptoms: [],
        })
      : previewPreset === 'peak'
      ? evaluateHeatRisk({
          airTemp: 44.5,
          humidity: 68,
          globeTemp: 52.0,
          sunExposure: 'full',
          workload: 'Heavy',
          acclimatized: true,
          heavyPPE: true,
          exposureHours: 4,
          isNewWorker: false,
          symptoms: [],
          forceMiddayBan: true,
        })
      : evaluation;

  const handlePlayVoiceSample = async (lang: 'en' | 'ar') => {
    if (playingSampleLang === lang) {
      stopAllSpeech();
      setPlayingSampleLang(null);
      return;
    }

    stopAllSpeech();
    setPlayingSampleLang(lang);

    const sampleText =
      lang === 'ar'
        ? `تنبيه درع الحرارة في دبي: مؤشر الحرارة الرطبة الكروية الحالي هو ${evaluation.wbgt.toFixed(
            1
          )} درجة مئوية. خذ استراحة في الظل واشرب الماء البارد كل خمس عشرة دقيقة.`
        : `HeatShield Dubai Advisory: Current WBGT is ${evaluation.wbgt.toFixed(
            1
          )} degrees Celsius. Move to a shaded rest hub and drink 250 milliliters of cold water every 15 minutes.`;

    await playTtsOrFallback(
      sampleText,
      lang,
      () => setPlayingSampleLang(lang),
      () => setPlayingSampleLang((curr) => (curr === lang ? null : curr)),
      0.95
    );
  };

  const heroDeckCards: HeroDeckCard[] = [
    {
      id: 'worker-card',
      role: 'worker',
      image: '/assets/images/dubai_worker_3d_1794411980911.jpg',
      alt: 'Dubai Construction Safety Engineer with HeatShield Tablet',
      titleEn: 'Field Crew Shield',
      titleAr: 'حماية العامل الميداني',
      subtitleEn: '6-language voice alerts & 14-day new-worker buffer',
      subtitleAr: 'تنبيهات صوتية بـ 6 لغات وحماية العمال الجدد',
      statLabel: 'WBGT Live',
      statValue: `${evaluation.wbgt.toFixed(1)}°C`,
      accentBg: 'bg-[#EBF5F0]',
    },
    {
      id: 'rider-card',
      role: 'rider',
      image: '/assets/images/dubai_rider_3d_1794412011010.jpg',
      alt: 'Dubai Delivery Rider Protected by HeatShield',
      titleEn: 'Rider Cool-by Route',
      titleAr: 'مسار تبريد سائقي التوصيل',
      subtitleEn: '6 Dubai AC cooling sanctuaries sorted by GPS ride time',
      subtitleAr: '6 محطات استراحة مكيفة في دبي مرتبة عبر GPS',
      statLabel: 'AC Hubs',
      statValue: '6 Hubs',
      accentBg: 'bg-[#F4F9F6]',
    },
    {
      id: 'supervisor-card',
      role: 'supervisor',
      image: '/assets/images/dubai_phone_mockup_1794411996277.jpg',
      alt: 'HeatShield Supervisor Mobile & Heatmap Dashboard',
      titleEn: 'Supervisor SmartShift',
      titleAr: 'لوحة المشرف وجدولة SmartShift',
      subtitleEn: '13 Dubai heat districts & 12:30–15:00 MoHRE stop plan',
      subtitleAr: 'خريطة 13 منطقة في دبي وتطبيق حظر الظهيرة',
      statLabel: 'Ban Window',
      statValue: '12:30–15:00',
      accentBg: 'bg-[#EBF5F0]',
    },
  ];

  const cycleCard = (dir: 1 | -1) => {
    const nextIdx = (activeCardIdx + dir + heroDeckCards.length) % heroDeckCards.length;
    setActiveCardIdx(nextIdx);
    setSelectedRole(heroDeckCards[nextIdx].role);
  };

  const handleSelectFeature = (idx: number) => {
    setFeatureDirection(idx >= activeFeatureIdx ? 1 : -1);
    setActiveFeatureIdx(idx);
  };

  const features = [
    {
      num: '01.',
      title: isAr ? 'حساب مؤشر الإجهاد الحراري WBGT (ISO 7243)' : 'ISO 7243 & Stull WBGT Engine',
      summary: isAr
        ? 'درجة حرارة الهواء وحدها لا تكشف خطر الرطوبة الساحلية والإشعاع الشمسي في دبي. نحسب مؤشر الحرارة الرطبة الكروية بدقة ونعدّل حدود الأمان حسب الجهد البدني وملابس الوقاية.'
        : 'Air temperature alone masks Dubai’s coastal humidity and radiant solar load. HeatShield computes thermodynamic wet-bulb and globe temperature and adjusts limits for workload, PPE, and acclimatization.',
      detail: isAr
        ? 'يدعم مستشعرات ESP32 الميدانية أو المحاكاة الموثوقة.'
        : 'Supports live ESP32 DHT22 + globe telemetry with instant simulation fallback.',
    },
    {
      num: '02.',
      title: isAr ? 'المساعد الصوتي والتنبيهات بـ 6 لغات' : 'Bilingual Arabic & English Voice Safety',
      summary: isAr
        ? 'أسئلة وأجوبة صوتية مباشرة باللغتين العربية والإنجليزية، مع نطق واضح للتنبيهات بـ 6 لغات ميدانية لضمان استجابة العامل فوراً دون عوائق قراءة.'
        : 'Hands-free voice Q&A and instant spoken safety alerts in Arabic and English, alongside 6 crew languages (AR, EN, HI, ML, KN, UR) for immediate comprehension on site.',
      detail: isAr
        ? 'استمع إلى النطق العربي والإنجليزي مباشرة هنا.'
        : 'Live bilingual speech synthesis ready to test right inside this card.',
    },
    {
      num: '03.',
      title: isAr ? 'حظر الظهيرة وجدولة SmartShift الذكية' : 'MoHRE Midday Ban & SmartShift Planning',
      summary: isAr
        ? 'تطبيق إلزامي لقرار حظر العمل تحت أشعة الشمس من 12:30 إلى 15:00، وتوجيه سائقي التوصيل إلى 6 محطات استراحة مبردة، وإعادة توزيع مهام الفرق عبر 13 منطقة في دبي.'
        : 'Enforces UAE Ministerial Decree No. 44 (12:30–15:00 sun-work stop), guides delivery riders to 6 Dubai AC sanctuaries, and builds compliant 06:00–18:00 SmartShift schedules.',
      detail: isAr
        ? 'تصدير فوري لسجلات الامتثال CSV لجهات التفتيش.'
        : 'Includes one-click CSV compliance audit export for Dubai Municipality & MoHRE inspectors.',
    },
  ];

  const roleLabels: Record<Role, { label: string; icon: React.ReactNode }> = {
    worker: { label: t.roles.worker, icon: <HardHat className="w-4 h-4 shrink-0" /> },
    rider: { label: t.roles.rider, icon: <Bike className="w-4 h-4 shrink-0" /> },
    supervisor: { label: t.roles.supervisor, icon: <Users className="w-4 h-4 shrink-0" /> },
  };

  // Helper returning flying slot transform for the 3-card interactive hero fan
  const getDeckCardLayout = (index: number) => {
    const offset = (index - activeCardIdx + heroDeckCards.length) % heroDeckCards.length;
    if (offset === 0) {
      // Front center spotlight card
      return {
        x: 0,
        y: 0,
        rotate: 0,
        scale: 1,
        zIndex: 30,
        opacity: 1,
      };
    }
    if (offset === 1) {
      // Right flying wing card
      return {
        x: isAr ? -68 : 68,
        y: 22,
        rotate: isAr ? -9 : 9,
        scale: 0.9,
        zIndex: 20,
        opacity: 0.94,
      };
    }
    // Left flying wing card
    return {
      x: isAr ? 68 : -68,
      y: 28,
      rotate: isAr ? 9 : -9,
      scale: 0.87,
      zIndex: 10,
      opacity: 0.88,
    };
  };

  const flyingFeatureCardVariants = {
    enter: (dir: number) =>
      prefersReducedMotion
        ? { opacity: 1, x: 0, y: 0, rotate: 0, scale: 1 }
        : {
            opacity: 0,
            x: dir * 90,
            y: 28,
            rotate: dir * 6,
            scale: 0.92,
          },
    center: {
      opacity: 1,
      x: 0,
      y: 0,
      rotate: 0,
      scale: 1,
    },
    exit: (dir: number) =>
      prefersReducedMotion
        ? { opacity: 0 }
        : {
            opacity: 0,
            x: dir * -90,
            y: -20,
            rotate: dir * -6,
            scale: 0.92,
          },
  };

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      lang={locale}
      className="min-h-screen bg-[#FAF8F3] text-[#173829] flex flex-col font-sans selection:bg-[#173829] selection:text-[#FAF8F3] overflow-x-hidden"
    >
      {/* Sticky Header Preserving Exact Cream & Heritage Green Theme */}
      <header className="sticky top-0 z-40 bg-[#FAF8F3]/95 backdrop-blur-md border-b border-[#E8E2D5] shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          {/* Brand Logo & Arabic Calligraphy */}
          <a
            href="#landing-top"
            className="flex items-center space-x-3 rtl:space-x-reverse whitespace-nowrap shrink-0"
          >
            <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-[#173829] text-white shadow-md shadow-[#173829]/20 border border-[#24533D]/40 shrink-0">
              <ShieldAlert className="w-5 h-5 text-[#FAF8F3]" />
            </div>
            <div className="flex items-baseline gap-x-2">
              <span className="font-arabic-calligraphy text-xl sm:text-2xl font-black text-[#173829] tracking-tight">
                دِرْعُ الحَرَارَةِ
              </span>
              <span className="text-[#557564] text-xs font-semibold font-sans tracking-wide">
                HeatShield
              </span>
            </div>
          </a>

          {/* Navigation Links */}
          <nav
            aria-label="Landing Navigation"
            className="hidden md:flex items-center gap-6 text-xs sm:text-sm font-bold text-[#2D4D3C]"
          >
            <a
              href="#features-deck"
              className="hover:text-[#173829] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              {isAr ? 'البطاقات التفاعلية' : 'Interactive Cards'}
            </a>
            <a
              href="#roles"
              className="hover:text-[#173829] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              {isAr ? 'الأدوار الميدانية' : 'Field Roles'}
            </a>
            <a
              href="#evidence"
              className="hover:text-[#173829] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              {isAr ? 'الأدلة العلمية' : 'Evidence'}
            </a>
            <a
              href="/team"
              onClick={(e) => {
                e.preventDefault();
                onOpenTeam();
              }}
              className="hover:text-[#173829] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              {isAr ? 'فريقنا' : 'Our Team'}
            </a>
            <button
              type="button"
              onClick={() => onSetLocale(locale === 'en' ? 'ar' : 'en')}
              className="hover:text-[#173829] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {locale === 'en' ? 'العربية' : 'English'}
            </button>
          </nav>

          {/* Primary Action */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onSetLocale(locale === 'en' ? 'ar' : 'en')}
              className="md:hidden px-2.5 py-2 rounded-xl bg-[#EFE9DC] text-[#173829] text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer"
            >
              {locale === 'en' ? 'العربية' : 'EN'}
            </button>

            <button
              type="button"
              onClick={() => onContinueAsGuest(selectedRole)}
              className="px-4 py-2.5 rounded-2xl bg-[#173829] hover:bg-[#24533D] text-[#FAF8F3] text-xs sm:text-sm font-bold transition-colors shadow-sm flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>{t.guestModal.continueBtn}</span>
              <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </button>
          </div>
        </div>
      </header>

      <main id="landing-top" className="flex-1">
        {/* SECTION 1: Hero with Interactive Flying 3D Card Fan (Same Cream/Mint/Heritage Green Theme) */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 pb-10">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-[#EBF5F0] via-[#F4F9F6] to-[#FAF8F3] border border-[#DCEBE2] shadow-sm px-5 sm:px-8 pt-7 pb-7">
            {/* Soft theme glows */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-[#D8ECE1]/45 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-80 h-80 bg-[#FEF7DA]/55 rounded-full blur-2xl pointer-events-none" />

            <div className="relative z-10 space-y-7">
              {/* Top context line + 2-option language selector */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#D5E5DC]">
                <div className="text-xs font-bold text-[#2D4D3C] flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>{isAr ? 'دبي، الإمارات العربية المتحدة' : 'Dubai Municipality & MoHRE Aligned'}</span>
                  <span aria-hidden="true">·</span>
                  <span>ISO 7243</span>
                  <span aria-hidden="true">·</span>
                  <span>{isAr ? 'حماية العمال وسائقي التوصيل' : 'Field Workers & Delivery Riders'}</span>
                </div>

                <div
                  role="radiogroup"
                  aria-label="Language options"
                  className="inline-flex bg-white p-1 rounded-2xl border border-[#D5E5DC] shadow-xs self-start sm:self-auto"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={locale === 'en'}
                    onClick={() => onSetLocale('en')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center space-x-1.5 rtl:space-x-reverse cursor-pointer whitespace-nowrap ${
                      locale === 'en'
                        ? 'bg-[#173829] text-[#FAF8F3] shadow-sm'
                        : 'text-[#4A6857] hover:text-[#173829] hover:bg-[#F4F9F6]'
                    }`}
                  >
                    <span>🇬🇧</span>
                    <span>English</span>
                  </button>

                  <button
                    type="button"
                    role="radio"
                    aria-checked={locale === 'ar'}
                    onClick={() => onSetLocale('ar')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center space-x-1.5 rtl:space-x-reverse font-arabic-calligraphy cursor-pointer whitespace-nowrap ${
                      locale === 'ar'
                        ? 'bg-[#173829] text-[#FAF8F3] shadow-sm'
                        : 'text-[#4A6857] hover:text-[#173829] hover:bg-[#F4F9F6]'
                    }`}
                  >
                    <span>🇦🇪</span>
                    <span>العربية (دبي)</span>
                  </button>
                </div>
              </div>

              {/* Hero Split: Left Copy & CTAs, Right Interactive Flying Card Stack */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                <motion.div
                  initial={prefersReducedMotion ? false : { opacity: 0, x: isAr ? 45 : -45, y: 12 }}
                  animate={{ opacity: 1, x: 0, y: 0 }}
                  transition={{ type: 'spring', stiffness: 120, damping: 18 }}
                  className="lg:col-span-6 space-y-5"
                >
                  <div className="space-y-1.5">
                    <h1 className="font-arabic-calligraphy text-4xl sm:text-5xl lg:text-[3.5rem] font-black text-[#173829] tracking-tight leading-tight">
                      دِرْعُ الحَرَارَةِ
                    </h1>
                    <div className="text-xl sm:text-2xl font-extrabold text-[#24533D] font-sans">
                      {isAr
                        ? 'HeatShield — إنذار مبكر للإجهاد الحراري قبل ذروة الظهيرة'
                        : 'HeatShield — Early Heat-Risk Warning Before Dubai’s Peak'}
                    </div>
                  </div>

                  <p className="text-sm sm:text-base text-[#385947] leading-relaxed max-w-xl font-medium">
                    {isAr
                      ? 'المنظومة الرقمية المتقدمة لرصد الإجهاد الحراري والتنبؤ بمخاطر ضربات الشمس لعمال البناء وسائقي التوصيل في إمارة دبي، مع مساعد صوتي بالعربية والإنجليزية وتخطيط ذكي للمناوبات.'
                      : 'Real-time Wet-Bulb Globe Temperature monitoring, bilingual Arabic & English voice Q&A, and SmartShift scheduling protecting outdoor crews and delivery riders across Dubai.'}
                  </p>

                  {/* Starting Role Selector */}
                  <div className="space-y-2 pt-1">
                    <div className="text-xs font-bold text-[#4A6857] tracking-wide">
                      {t.guestModal.chooseRole}
                    </div>
                    <div
                      role="radiogroup"
                      aria-label={t.guestModal.chooseRole}
                      className="flex flex-wrap gap-2"
                    >
                      {(['worker', 'rider', 'supervisor'] as Role[]).map((r) => (
                        <button
                          key={r}
                          type="button"
                          role="radio"
                          aria-checked={selectedRole === r}
                          onClick={() => handleSelectRole(r)}
                          className={`flex items-center space-x-2 rtl:space-x-reverse px-4 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                            selectedRole === r
                              ? 'bg-[#173829] text-[#FAF8F3] shadow-sm ring-2 ring-[#173829]/20'
                              : 'bg-white hover:bg-[#EBF5F0] text-[#2D4D3C] border border-[#D5E5DC]'
                          }`}
                        >
                          {roleLabels[r].icon}
                          <span>{roleLabels[r].label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Primary Action + Voice Q&A */}
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <motion.button
                      type="button"
                      whileHover={prefersReducedMotion ? undefined : { scale: 1.03, y: -2 }}
                      whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
                      onClick={() => onContinueAsGuest(selectedRole)}
                      className="px-6 py-3.5 rounded-2xl bg-[#173829] hover:bg-[#24533D] text-[#FAF8F3] font-black text-sm shadow-lg shadow-[#173829]/20 transition-colors flex items-center gap-2.5 cursor-pointer whitespace-nowrap"
                    >
                      <span>{t.guestModal.continueBtn}</span>
                      <ArrowRight className="w-4 h-4 rtl:rotate-180" />
                    </motion.button>

                    <motion.button
                      type="button"
                      whileHover={prefersReducedMotion ? undefined : { scale: 1.03, y: -2 }}
                      whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
                      onClick={onOpenVoiceQa}
                      className="px-4 py-3.5 rounded-2xl bg-white hover:bg-[#EFE9DC] text-[#173829] border border-[#D5E5DC] font-bold text-xs sm:text-sm transition-colors flex items-center gap-2 shadow-xs cursor-pointer whitespace-nowrap"
                    >
                      <Mic className="w-4 h-4 text-[#173829]" />
                      <span>{isAr ? 'تجربة المساعد الصوتي' : 'Try Voice Q&A'}</span>
                    </motion.button>
                  </div>

                  <p className="text-[11px] text-[#557564]">{t.guestModal.roleNotice}</p>
                </motion.div>

                {/* Right: Interactive Flying Card Deck Showcase */}
                <div className="lg:col-span-6 flex flex-col items-center">
                  <div className="relative w-full max-w-md h-[350px] sm:h-[380px] flex items-center justify-center">
                    {heroDeckCards.map((card, index) => {
                      const layout = getDeckCardLayout(index);
                      const isFront = index === activeCardIdx;

                      return (
                        <motion.div
                          key={card.id}
                          initial={
                            prefersReducedMotion
                              ? false
                              : {
                                  opacity: 0,
                                  x: index === 0 ? 120 : index === 1 ? 180 : -140,
                                  y: index === 0 ? -90 : 80,
                                  rotate: index === 1 ? 18 : -16,
                                  scale: 0.78,
                                }
                          }
                          animate={layout}
                          whileHover={
                            prefersReducedMotion
                              ? undefined
                              : isFront
                              ? { y: -8, scale: 1.02 }
                              : { y: layout.y - 12, scale: layout.scale + 0.04 }
                          }
                          transition={{
                            type: 'spring',
                            stiffness: 185,
                            damping: 20,
                            mass: 0.9,
                          }}
                          onClick={() => {
                            setActiveCardIdx(index);
                            setSelectedRole(card.role);
                          }}
                          className={`absolute w-[250px] sm:w-[276px] rounded-3xl overflow-hidden bg-white border-2 cursor-pointer select-none will-change-transform ${
                            isFront
                              ? 'border-[#173829] shadow-2xl shadow-[#173829]/20'
                              : 'border-[#D5E5DC] shadow-lg shadow-[#173829]/10'
                          }`}
                        >
                          {/* Top 3D visual */}
                          <div className={`relative h-44 sm:h-48 ${card.accentBg} overflow-hidden`}>
                            <img
                              src={card.image}
                              alt={card.alt}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#173829]/75 to-transparent" />
                            <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-white">
                              <span className="text-[11px] font-bold">
                                {isAr ? card.titleAr : card.titleEn}
                              </span>
                              <span className="font-mono text-xs font-black bg-white/95 text-[#173829] px-2 py-0.5 rounded-lg tabular-nums">
                                {card.statValue}
                              </span>
                            </div>
                          </div>

                          {/* Card Footer Info */}
                          <div className="p-4 space-y-3 bg-white">
                            <div className="flex items-center justify-between text-[11px] font-bold text-[#4A6857]">
                              <span>{card.statLabel}</span>
                              <span>0{index + 1} / 03</span>
                            </div>
                            <p className="text-xs font-semibold text-[#173829] leading-snug min-h-[2.2rem]">
                              {isAr ? card.subtitleAr : card.subtitleEn}
                            </p>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onContinueAsGuest(card.role);
                              }}
                              className="w-full py-2 px-3 rounded-xl bg-[#EBF5F0] hover:bg-[#173829] text-[#173829] hover:text-[#FAF8F3] text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <span>
                                {isAr ? 'افتح هذه البطاقة' : 'Launch View'}
                              </span>
                              <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* Interactive Card Flight Controls */}
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => cycleCard(-1)}
                      aria-label="Previous card"
                      className="p-2 rounded-xl bg-white hover:bg-[#EFE9DC] border border-[#D5E5DC] text-[#173829] transition-colors shadow-xs cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
                    </button>

                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#D5E5DC] text-xs font-bold text-[#2D4D3C] shadow-xs">
                      <Sparkles className="w-3.5 h-3.5 text-[#173829]" />
                      <span>
                        {isAr ? 'انقر على أي بطاقة لتحلق للأمام' : 'Click any card to fly it forward'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => cycleCard(1)}
                      aria-label="Next card"
                      className="p-2 rounded-xl bg-white hover:bg-[#EFE9DC] border border-[#D5E5DC] text-[#173829] transition-colors shadow-xs cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4 rtl:rotate-180" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Dubai Skyline Ribbon */}
              <div className="pt-3 border-t border-[#D5E5DC]/80">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold tracking-wider text-[#4A6857] flex items-center space-x-1.5 rtl:space-x-reverse">
                    <MapPin className="w-3.5 h-3.5 text-[#173829]" />
                    <span>
                      {isAr
                        ? 'أفق دبي المعماري • وسط المدينة، برج خليفة، ومارينا دبي'
                        : 'Dubai Iconic Landmarks · Downtown, Marina & Creek'}
                    </span>
                  </span>
                  <span className="text-[10px] font-semibold text-[#6C8D7B]">
                    {isAr ? 'حماية شاملة للمشاريع الكبرى' : 'Comprehensive Urban Safety'}
                  </span>
                </div>
                <DubaiSkyline fillColor="#173829" accentColor="#2D5E46" height={66} />
              </div>

              {/* Flying Staggered Metric Cards Row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  {
                    icon: <ShieldCheck className="w-5 h-5 text-[#173829]" />,
                    value: '0',
                    label: isAr ? 'إصابات حرجة في 2026' : 'Heat Incidents',
                    flyFrom: { x: -60, y: 24, rotate: -6 },
                  },
                  {
                    icon: <MapPin className="w-5 h-5 text-[#173829]" />,
                    value: '6',
                    label: isAr ? 'محطات استراحة مكيفة' : 'Cooling Sanctuaries',
                    flyFrom: { x: -24, y: 40, rotate: -3 },
                  },
                  {
                    icon: <HeartHandshake className="w-5 h-5 text-[#173829]" />,
                    value: '96%',
                    label: isAr ? 'التزام بفترات الراحة' : 'Rest Adherence',
                    flyFrom: { x: 24, y: 40, rotate: 3 },
                  },
                  {
                    icon: <Award className="w-5 h-5 text-[#173829]" />,
                    value: '100%',
                    label: isAr ? 'امتثال لقرار حظر الظهيرة' : 'MoHRE Midday Ban',
                    flyFrom: { x: 60, y: 24, rotate: 6 },
                  },
                ].map((metric, idx) => (
                  <motion.div
                    key={metric.label}
                    initial={
                      prefersReducedMotion
                        ? false
                        : { opacity: 0, ...metric.flyFrom, scale: 0.9 }
                    }
                    animate={{ opacity: 1, x: 0, y: 0, rotate: 0, scale: 1 }}
                    whileHover={
                      prefersReducedMotion
                        ? undefined
                        : { y: -6, rotate: idx % 2 === 0 ? -1.2 : 1.2, scale: 1.02 }
                    }
                    transition={{
                      type: 'spring',
                      stiffness: 170,
                      damping: 18,
                      delay: 0.12 + idx * 0.08,
                    }}
                    className="bg-white/95 backdrop-blur-xs p-3.5 rounded-2xl border border-[#D5E5DC] shadow-xs flex items-center space-x-3 rtl:space-x-reverse will-change-transform"
                  >
                    <div className="p-2.5 rounded-xl bg-[#EBF5F0] text-[#173829] shrink-0">
                      {metric.icon}
                    </div>
                    <div>
                      <div className="text-xl font-black text-[#173829] font-mono tabular-nums">
                        {metric.value}
                      </div>
                      <div className="text-[10px] font-bold text-[#4A6857]">
                        {metric.label}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2: Interactive Flying Feature Cards Showcase */}
        <section
          id="features-deck"
          className="border-t border-b border-[#E5DFD3] bg-[#F4EFE6]/70"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-20">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
              <div className="max-w-2xl space-y-2">
                <div className="text-xs font-bold tracking-wider text-[#4A6857]">
                  {isAr ? 'بطاقات النظام التفاعلية' : 'Interactive Capability Deck · Instant Preview'}
                </div>
                <h2 className="text-2xl sm:text-4xl font-black text-[#173829] tracking-tight">
                  {isAr
                    ? 'اختر أي بطاقة لتحلق أمامك وتختبر النظام مباشرة.'
                    : 'Pick any card to fly into focus and test HeatShield live.'}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => handleSelectFeature((activeFeatureIdx + 1) % features.length)}
                className="px-4 py-2.5 rounded-2xl bg-white hover:bg-[#EBF5F0] text-[#173829] border border-[#D5E5DC] text-xs font-bold flex items-center gap-2 self-start md:self-auto shadow-xs transition-colors cursor-pointer whitespace-nowrap"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>{isAr ? 'البطاقة التالية' : 'Fly Next Card'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left: 3 Clickable Flying Selector Cards */}
              <div className="lg:col-span-5 space-y-4">
                {features.map((feat, idx) => {
                  const isActive = activeFeatureIdx === idx;
                  return (
                    <motion.button
                      key={feat.num}
                      type="button"
                      onClick={() => handleSelectFeature(idx)}
                      initial={
                        prefersReducedMotion
                          ? false
                          : { opacity: 0, x: isAr ? 60 : -60, rotate: -3 }
                      }
                      whileInView={{ opacity: 1, x: 0, rotate: 0 }}
                      viewport={{ once: true, amount: 0.25 }}
                      whileHover={
                        prefersReducedMotion
                          ? undefined
                          : { x: isAr ? -8 : 8, y: -3, scale: 1.015 }
                      }
                      transition={{
                        type: 'spring',
                        stiffness: 190,
                        damping: 20,
                        delay: idx * 0.08,
                      }}
                      className={`w-full text-start p-5 rounded-3xl border transition-colors cursor-pointer will-change-transform ${
                        isActive
                          ? 'bg-white border-[#173829] shadow-lg shadow-[#173829]/10'
                          : 'bg-[#FAF8F3]/90 border-[#DDD4C3] hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2 text-xs font-bold text-[#4A6857]">
                        <span className="font-mono">{feat.num}</span>
                        <span>
                          {isActive
                            ? isAr
                              ? 'معروضة الآن'
                              : 'In Flight'
                            : isAr
                            ? 'انقر للعرض'
                            : 'Select card'}
                        </span>
                      </div>
                      <h3 className="text-lg font-extrabold text-[#173829] mb-1.5">{feat.title}</h3>
                      <p className="text-xs sm:text-sm text-[#385947] leading-relaxed mb-2.5">
                        {feat.summary}
                      </p>
                      <div className="pt-2.5 border-t border-[#ECE6DA] text-xs font-medium text-[#557564]">
                        {feat.detail}
                      </div>
                    </motion.button>
                  );
                })}
              </div>

              {/* Right: Flying Interactive Stage Card */}
              <div className="lg:col-span-7">
                <div className="rounded-3xl bg-white border border-[#DDD4C3] p-6 sm:p-8 shadow-md overflow-hidden">
                  <div className="flex items-center justify-between gap-4 pb-4 mb-5 border-b border-[#ECE6DA]">
                    <div className="text-xs font-bold text-[#4A6857] font-mono tabular-nums">
                      {isAr
                        ? `البطاقة 0${activeFeatureIdx + 1} / 03`
                        : `Card 0${activeFeatureIdx + 1} / 03`}
                    </div>
                    <div className="flex items-center gap-1 p-1 bg-[#EBF3EE] rounded-xl border border-[#D5E5DC]">
                      {[0, 1, 2].map((idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSelectFeature(idx)}
                          className={`px-3 py-1 rounded-lg text-xs font-bold font-mono transition-colors cursor-pointer ${
                            activeFeatureIdx === idx
                              ? 'bg-[#173829] text-[#FAF8F3] shadow-xs'
                              : 'text-[#2D4D3C] hover:text-[#173829]'
                          }`}
                        >
                          0{idx + 1}
                        </button>
                      ))}
                    </div>
                  </div>

                  <AnimatePresence mode="wait" custom={featureDirection}>
                    {activeFeatureIdx === 0 && (
                      <motion.div
                        key="feat-0"
                        custom={featureDirection}
                        variants={flyingFeatureCardVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ type: 'spring', stiffness: 210, damping: 22 }}
                        className="space-y-5 will-change-transform"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <h4 className="text-lg font-extrabold text-[#173829]">
                              {isAr
                                ? 'معاينة محرك الحساب الحراري ISO 7243'
                                : 'Live ISO 7243 WBGT Engine Preview'}
                            </h4>
                            <p className="text-xs text-[#4A6857]">
                              {isAr
                                ? 'جرّب سيناريوهات دبي المختلفة مباشرة'
                                : 'Test how Dubai microclimate shifts the safety margin'}
                            </p>
                          </div>

                          <div className="flex items-center gap-1 p-1 bg-[#EFE9DC] rounded-xl border border-[#DDD4C3] self-start">
                            {(
                              [
                                { id: 'morning', label: isAr ? 'صباح 31°' : '07:00 AM' },
                                { id: 'current', label: isAr ? 'الحالي' : 'Live' },
                                { id: 'peak', label: isAr ? 'ذروة 44°' : '01:30 PM' },
                              ] as const
                            ).map((preset) => (
                              <button
                                key={preset.id}
                                type="button"
                                onClick={() => setPreviewPreset(preset.id)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                                  previewPreset === preset.id
                                    ? 'bg-[#173829] text-[#FAF8F3]'
                                    : 'text-[#4A6857] hover:text-[#173829]'
                                }`}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="p-4 rounded-2xl bg-[#FAF8F3] border border-[#E5DFD3]">
                            <div className="flex items-center gap-1.5 text-xs text-[#4A6857] mb-1 font-semibold">
                              <Thermometer className="w-3.5 h-3.5 text-orange-600" />
                              <span>{isAr ? 'الهواء' : 'Air Temp'}</span>
                            </div>
                            <div className="text-xl font-black font-mono tabular-nums text-[#173829]">
                              {previewEval.airTemp.toFixed(1)}°C
                            </div>
                          </div>
                          <div className="p-4 rounded-2xl bg-[#FAF8F3] border border-[#E5DFD3]">
                            <div className="flex items-center gap-1.5 text-xs text-[#4A6857] mb-1 font-semibold">
                              <Droplets className="w-3.5 h-3.5 text-cyan-600" />
                              <span>{isAr ? 'الرطوبة' : 'Humidity'}</span>
                            </div>
                            <div className="text-xl font-black font-mono tabular-nums text-[#173829]">
                              {previewEval.humidity}%
                            </div>
                          </div>
                          <div className="p-4 rounded-2xl bg-[#FAF8F3] border border-[#E5DFD3]">
                            <div className="flex items-center gap-1.5 text-xs text-[#4A6857] mb-1 font-semibold">
                              <Sun className="w-3.5 h-3.5 text-amber-600" />
                              <span>{isAr ? 'الإشعاع' : 'Globe Temp'}</span>
                            </div>
                            <div className="text-xl font-black font-mono tabular-nums text-[#173829]">
                              {previewEval.globeTemp.toFixed(1)}°C
                            </div>
                          </div>
                          <div
                            className={`p-4 rounded-2xl border ${
                              previewEval.riskLevel === 'Critical'
                                ? 'bg-[#FFF5F5] border-[#FCA5A5]'
                                : 'bg-[#EBF5F0] border-[#C5DFD0]'
                            }`}
                          >
                            <div className="text-xs font-bold text-[#4A6857] mb-1">WBGT</div>
                            <div
                              className={`text-xl font-black font-mono tabular-nums ${
                                previewEval.riskLevel === 'Critical'
                                  ? 'text-[#C81D25]'
                                  : 'text-[#173829]'
                              }`}
                            >
                              {previewEval.wbgt.toFixed(1)}°C
                            </div>
                          </div>
                        </div>

                        <div className="p-4 rounded-2xl bg-[#FAF8F3] border border-[#E5DFD3] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <div className="text-xs font-bold text-[#4A6857]">
                              {isAr ? 'الإجراء الوقائي الفوري:' : 'Deterministic Action Protocol:'}
                            </div>
                            <div className="text-sm font-extrabold text-[#173829] mt-0.5">
                              {previewEval.safeAction}
                            </div>
                          </div>
                          <span
                            className={`px-3 py-1 rounded-xl text-xs font-bold shrink-0 self-start sm:self-center whitespace-nowrap ${
                              previewEval.riskLevel === 'Critical'
                                ? 'bg-[#C81D25] text-white'
                                : previewEval.riskLevel === 'High'
                                ? 'bg-[#B45309] text-white'
                                : 'bg-[#173829] text-[#FAF8F3]'
                            }`}
                          >
                            {previewEval.riskLevel} Risk
                          </span>
                        </div>
                      </motion.div>
                    )}

                    {activeFeatureIdx === 1 && (
                      <motion.div
                        key="feat-1"
                        custom={featureDirection}
                        variants={flyingFeatureCardVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ type: 'spring', stiffness: 210, damping: 22 }}
                        className="space-y-5 will-change-transform"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <h4 className="text-lg font-extrabold text-[#173829]">
                              {isAr
                                ? 'القراءة الصوتية بالعربية والإنجليزية'
                                : 'Interactive Bilingual Audio Readout'}
                            </h4>
                            <p className="text-xs text-[#4A6857]">
                              {isAr
                                ? 'استمع إلى التقرير الصوتي مباشرة أو افتح المساعد الصوتي.'
                                : 'Hear live Arabic or English heat-safety briefings or launch Voice Q&A.'}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={onOpenVoiceQa}
                            className="px-4 py-2 rounded-xl bg-[#173829] hover:bg-[#24533D] text-[#FAF8F3] text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer whitespace-nowrap"
                          >
                            <Mic className="w-3.5 h-3.5 text-[#A3E5C1]" />
                            <span>{isAr ? 'فتح المساعد الصوتي' : 'Open Voice Q&A'}</span>
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="p-4 rounded-2xl bg-[#FAF8F3] border border-[#E5DFD3] flex flex-col justify-between space-y-3">
                            <div className="space-y-1.5">
                              <div className="text-xs font-bold text-[#4A6857]">
                                English Audio Briefing
                              </div>
                              <p className="text-xs text-[#173829] leading-relaxed">
                                "Current WBGT is {evaluation.wbgt.toFixed(1)}°C. Move to a shaded
                                rest hub and drink 250ml cold water every 15 minutes."
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handlePlayVoiceSample('en')}
                              className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                                playingSampleLang === 'en'
                                  ? 'bg-[#C81D25] text-white'
                                  : 'bg-[#173829] hover:bg-[#24533D] text-[#FAF8F3]'
                              }`}
                            >
                              {playingSampleLang === 'en' ? (
                                <>
                                  <Square className="w-3.5 h-3.5 fill-current" />
                                  <span>Stop English Audio</span>
                                </>
                              ) : (
                                <>
                                  <Volume2 className="w-3.5 h-3.5" />
                                  <span>Hear in English</span>
                                </>
                              )}
                            </button>
                          </div>

                          <div
                            dir="rtl"
                            className="p-4 rounded-2xl bg-[#FAF8F3] border border-[#E5DFD3] flex flex-col justify-between space-y-3"
                          >
                            <div className="space-y-1.5">
                              <div className="text-xs font-bold text-[#4A6857]">
                                التنبيه الصوتي بالعربية
                              </div>
                              <p className="text-xs text-[#173829] leading-relaxed">
                                "مؤشر الحرارة الرطبة الكروية الحالي هو{' '}
                                {evaluation.wbgt.toFixed(1)} درجة مئوية. خذ استراحة في الظل واشرب
                                الماء البارد كل 15 دقيقة."
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handlePlayVoiceSample('ar')}
                              className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                                playingSampleLang === 'ar'
                                  ? 'bg-[#C81D25] text-white'
                                  : 'bg-[#173829] hover:bg-[#24533D] text-[#FAF8F3]'
                              }`}
                            >
                              {playingSampleLang === 'ar' ? (
                                <>
                                  <Square className="w-3.5 h-3.5 fill-current" />
                                  <span>إيقاف الصوت العربي</span>
                                </>
                              ) : (
                                <>
                                  <Volume2 className="w-3.5 h-3.5" />
                                  <span>استمع بالعربية</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        <div className="text-xs text-[#557564] font-medium">
                          {isAr ? 'لغات التنبيه المدعومة: ' : 'Supported crew alert languages: '}
                          <span className="font-bold text-[#173829]">
                            العربية · English · हिन्दी · മലയാളം · ಕನ್ನಡ · اردو
                          </span>
                        </div>
                      </motion.div>
                    )}

                    {activeFeatureIdx === 2 && (
                      <motion.div
                        key="feat-2"
                        custom={featureDirection}
                        variants={flyingFeatureCardVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ type: 'spring', stiffness: 210, damping: 22 }}
                        className="space-y-4 will-change-transform"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <h4 className="text-lg font-extrabold text-[#173829]">
                              {isAr
                                ? 'مخطط SmartShift اليومي (06:00 - 18:00)'
                                : 'Daily SmartShift Schedule (06:00 – 18:00)'}
                            </h4>
                            <p className="text-xs text-[#4A6857]">
                              {isAr
                                ? 'إيقاف تلقائي للأعمال المكشوفة أثناء حظر الظهيرة في دبي'
                                : 'Automatic outdoor halt during UAE MoHRE midday ban hours'}
                            </p>
                          </div>
                          <span className="text-xs font-mono font-black text-[#C81D25]">
                            12:30 – 15:00 STOP
                          </span>
                        </div>

                        <div className="space-y-2.5">
                          {[
                            {
                              time: '06:00 – 09:30',
                              title: isAr
                                ? 'نافذة الصباح الآمنة (أعمال ثقيلة)'
                                : 'Early Cool Window · Heavy Structural Work',
                              note: isAr
                                ? 'صب الخرسانة وتركيب السقالات'
                                : 'Concrete casting & heavy scaffolding',
                              ban: false,
                            },
                            {
                              time: '12:30 – 15:00',
                              title: isAr
                                ? 'حظر الظهيرة القانوني (توقف إلزامي)'
                                : 'UAE Legal Midday Ban · Mandatory AC Rest',
                              note: isAr
                                ? 'إخلاء كامل من الشمس وتبريد في الاستراحات'
                                : 'Zero open-sun labor · Cooling hubs active',
                              ban: true,
                            },
                            {
                              time: '16:30 – 18:00',
                              title: isAr
                                ? 'النافذة المسائية المعتدلة'
                                : 'Evening Cooling Window · Finishing & Checks',
                              note: isAr
                                ? 'فحوصات الجودة وتجهيز الموقع'
                                : 'Site inspections & material staging',
                              ban: false,
                            },
                          ].map((slot) => (
                            <div
                              key={slot.time}
                              className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                                slot.ban
                                  ? 'bg-[#FFF5F5] border-[#FCA5A5] text-[#991B1B]'
                                  : 'bg-[#FAF8F3] border-[#E5DFD3] text-[#173829]'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <Clock className="w-4 h-4 shrink-0" />
                                <div>
                                  <div className="text-xs font-bold">{slot.title}</div>
                                  <div className="text-[11px] opacity-85">{slot.note}</div>
                                </div>
                              </div>
                              <span className="font-mono text-xs font-bold shrink-0 tabular-nums">
                                {slot.time}
                              </span>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 3: Flying Role Cards Trio */}
        <section id="roles" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-20 space-y-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="max-w-2xl space-y-2">
              <div className="text-xs font-bold tracking-wider text-[#4A6857]">
                {isAr ? 'واجهات متخصصة لكل دور' : 'Role-Specific Views'}
              </div>
              <h2 className="text-2xl sm:text-4xl font-black text-[#173829] tracking-tight">
                {isAr
                  ? 'ثلاث بطاقات ميدانية تنطلق من محرك أمان واحد.'
                  : 'Three field views powered by one deterministic engine.'}
              </h2>
            </div>

            <button
              type="button"
              onClick={() => onContinueAsGuest(selectedRole)}
              className="text-sm font-bold text-[#173829] hover:underline flex items-center gap-1.5 self-start md:self-auto cursor-pointer whitespace-nowrap"
            >
              <span>{t.guestModal.continueBtn}</span>
              <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Role 1: Worker */}
            <motion.article
              initial={prefersReducedMotion ? false : { opacity: 0, x: -70, y: 45, rotate: -6 }}
              whileInView={{ opacity: 1, x: 0, y: 0, rotate: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              whileHover={prefersReducedMotion ? undefined : { y: -10, rotate: -1, scale: 1.02 }}
              transition={{ type: 'spring', stiffness: 165, damping: 18 }}
              className="bg-white border border-[#DDD4C3] rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-shadow flex flex-col justify-between will-change-transform"
            >
              <div className="aspect-[4/3] bg-[#EBF5F0] overflow-hidden">
                <img
                  src="/assets/images/dubai_worker_3d_1794411980911.jpg"
                  alt="Dubai Construction Worker"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="text-xs font-bold text-[#4A6857] flex items-center gap-1.5">
                    <HardHat className="w-4 h-4 text-[#173829]" />
                    <span>01. {t.roles.worker}</span>
                  </div>
                  <h3 className="text-xl font-extrabold text-[#173829]">
                    {isAr ? 'حماية العامل الميداني' : 'Outdoor Construction Crew'}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#385947] leading-relaxed">
                    {isAr
                      ? 'تنبيهات صوتية بـ 6 لغات، متابعة شرب الماء، فحص الزملاء، وحماية العمال الجدد (14 يوماً) مع زر طوارئ SOS.'
                      : 'Multilingual voice alerts, hydration tracker, buddy check-ins, 14-day unacclimatized threshold, and early heat-strain SOS.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onContinueAsGuest('worker')}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#173829] hover:bg-[#24533D] text-[#FAF8F3] text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <span>{isAr ? 'الدخول كعامل' : 'Enter as Worker'}</span>
                  <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
                </button>
              </div>
            </motion.article>

            {/* Role 2: Rider */}
            <motion.article
              initial={prefersReducedMotion ? false : { opacity: 0, y: 75, scale: 0.9 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, amount: 0.2 }}
              whileHover={prefersReducedMotion ? undefined : { y: -12, scale: 1.025 }}
              transition={{ type: 'spring', stiffness: 165, damping: 18, delay: 0.08 }}
              className="bg-white border border-[#DDD4C3] rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-shadow flex flex-col justify-between will-change-transform"
            >
              <div className="aspect-[4/3] bg-[#EBF5F0] overflow-hidden">
                <img
                  src="/assets/images/dubai_rider_3d_1794412011010.jpg"
                  alt="Dubai Delivery Rider"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="text-xs font-bold text-[#4A6857] flex items-center gap-1.5">
                    <Bike className="w-4 h-4 text-[#173829]" />
                    <span>02. {t.roles.rider}</span>
                  </div>
                  <h3 className="text-xl font-extrabold text-[#173829]">
                    {isAr ? 'مسار التبريد لسائقي التوصيل' : 'Delivery Rider Cool-by Routing'}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#385947] leading-relaxed">
                    {isAr
                      ? 'حساب الوقت المتبقي قبل الخطر الحراري، وترتيب 6 محطات استراحة مكيفة في دبي حسب موقعك عبر GPS.'
                      : 'Estimates minutes until High WBGT cutoff and sorts 6 certified Dubai AC cooling hubs by GPS riding time with turn-by-turn navigation.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onContinueAsGuest('rider')}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#173829] hover:bg-[#24533D] text-[#FAF8F3] text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <span>{isAr ? 'الدخول كسائق توصيل' : 'Enter as Rider'}</span>
                  <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
                </button>
              </div>
            </motion.article>

            {/* Role 3: Supervisor */}
            <motion.article
              initial={prefersReducedMotion ? false : { opacity: 0, x: 70, y: 45, rotate: 6 }}
              whileInView={{ opacity: 1, x: 0, y: 0, rotate: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              whileHover={prefersReducedMotion ? undefined : { y: -10, rotate: 1, scale: 1.02 }}
              transition={{ type: 'spring', stiffness: 165, damping: 18, delay: 0.16 }}
              className="bg-white border border-[#DDD4C3] rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-shadow flex flex-col justify-between will-change-transform"
            >
              <div className="aspect-[4/3] bg-[#EBF5F0] overflow-hidden">
                <img
                  src="/assets/images/dubai_phone_mockup_1794411996277.jpg"
                  alt="HeatShield Supervisor Dashboard"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="text-xs font-bold text-[#4A6857] flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-[#173829]" />
                    <span>03. {t.roles.supervisor}</span>
                  </div>
                  <h3 className="text-xl font-extrabold text-[#173829]">
                    {isAr ? 'قيادة الموقع وخريطة دبي الحرارية' : 'Site Supervisor & SmartShift'}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#385947] leading-relaxed">
                    {isAr
                      ? 'خريطة دبي التفاعلية لـ 13 منطقة، جدول الفرق الثلاثة بدون تعقب شخصي، وتخطيط SmartShift وتصدير CSV.'
                      : 'Interactive 13-district Dubai heat map, 3-crew live WBGT grid, SmartShift schedule optimizer, and MoHRE compliance CSV export.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onContinueAsGuest('supervisor')}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#173829] hover:bg-[#24533D] text-[#FAF8F3] text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <span>{isAr ? 'الدخول كمشرف' : 'Enter as Supervisor'}</span>
                  <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
                </button>
              </div>
            </motion.article>
          </div>
        </section>

        {/* SECTION 4: Evidence & Impact Strip */}
        <section id="evidence" className="border-t border-b border-[#E5DFD3] bg-[#EBF5F0]/55">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-16 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="text-xs font-bold tracking-wider text-[#24533D]">
                {isAr ? 'الأبحاث العلمية وعتاد ESP32' : 'Scientific Evidence & ESP32 Hardware'}
              </div>
              <h2 className="text-2xl font-black text-[#173829]">
                {isAr
                  ? 'مبني على 5 دراسات محكمة ومعيار ISO 7243 وقرار حظر الظهيرة.'
                  : 'Grounded in 5 peer-reviewed Gulf & ISO 7243 studies and UAE MoHRE Decree No. 44.'}
              </h2>
              <p className="text-xs sm:text-sm text-[#385947]">
                {isAr
                  ? 'اطلع على المعادلات الكاملة، الدراسات المرجعية، وشيفرة Arduino الجاهزة لمستشعر ESP32.'
                  : 'Inspect peer-reviewed citations, lead-time & adherence impact metrics, and turnkey ESP32 C++ sensor firmware.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={onOpenEvidence}
                className="px-4 py-2.5 rounded-2xl bg-white hover:bg-[#FAF8F3] text-[#173829] border border-[#D5E5DC] text-xs font-bold flex items-center gap-2 shadow-xs cursor-pointer whitespace-nowrap"
              >
                <BookOpen className="w-4 h-4 text-[#173829]" />
                <span>{t.nav.evidence}</span>
              </button>
              <button
                type="button"
                onClick={onOpenImpact}
                className="px-4 py-2.5 rounded-2xl bg-white hover:bg-[#FAF8F3] text-[#173829] border border-[#D5E5DC] text-xs font-bold flex items-center gap-2 shadow-xs cursor-pointer whitespace-nowrap"
              >
                <TrendingUp className="w-4 h-4 text-[#173829]" />
                <span>{t.nav.impact}</span>
              </button>
            </div>
          </div>
        </section>

        {/* SECTION 5: Flying Final Continue-as-Guest Banner */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-18">
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 48, scale: 0.94 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ type: 'spring', stiffness: 150, damping: 18 }}
            className="rounded-3xl bg-[#173829] text-[#FAF8F3] p-8 sm:p-12 shadow-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8 will-change-transform"
          >
            <div className="space-y-3 max-w-xl">
              <div className="font-arabic-calligraphy text-2xl text-[#A3E5C1]">
                دِرْعُ الحَرَارَةِ · HeatShield
              </div>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
                {isAr
                  ? 'ابدأ التجربة التفاعلية الكاملة الآن كضيف.'
                  : 'Launch the full interactive HeatShield workspace.'}
              </h2>
              <p className="text-xs sm:text-sm text-[#D7E6DD] leading-relaxed">
                {isAr
                  ? 'اختبر محاكاة موجة الحر، اربط مستشعر ESP32، استمع للتنبيهات الصوتية، وخطط مناوبات الفرق في دبي.'
                  : 'Simulate the 60-second heat-wave ramp, connect live ESP32 hardware, listen to 6-language voice alerts, and plan Dubai crew shifts.'}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
              <div className="flex items-center gap-1 p-1 rounded-2xl bg-white/10 border border-white/15">
                {(['worker', 'rider', 'supervisor'] as Role[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => handleSelectRole(r)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                      selectedRole === r
                        ? 'bg-[#FAF8F3] text-[#173829]'
                        : 'text-[#D7E6DD] hover:text-white'
                    }`}
                  >
                    {roleLabels[r].label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => onContinueAsGuest(selectedRole)}
                className="px-7 py-3.5 rounded-2xl bg-[#FAF8F3] hover:bg-white text-[#173829] font-black text-sm flex items-center justify-center gap-2 shadow-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <span>{t.guestModal.continueBtn}</span>
                <ArrowRight className="w-4 h-4 rtl:rotate-180" />
              </button>
            </div>
          </motion.div>
        </section>
      </main>

      <Footer
        onOpenEvidence={onOpenEvidence}
        onOpenImpact={onOpenImpact}
        onOpenTeam={onOpenTeam}
        locale={locale}
      />
    </div>
  );
};
