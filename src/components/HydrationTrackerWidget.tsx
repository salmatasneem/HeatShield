import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  GlassWater,
  Bell,
  BellOff,
  Plus,
  Minus,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Flame,
  Award,
  Sparkles,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { RiskEvaluation } from '../types';
import { AppLocale } from '../utils/i18n';
import { playAlertChime, playCelebrationChime } from '../utils/speech';

interface HydrationTrackerWidgetProps {
  evaluation: RiskEvaluation;
  role: 'worker' | 'rider';
  locale: AppLocale;
  waterMl: number;
  electrolytesCount: number;
  hydrationStreak: number;
  goalStreakDays?: number;
  lastLoggedTime: string | null;
  onLogDrink: (ml: number, isElectrolyte?: boolean, wasOnSchedule?: boolean) => void;
  onUndoDrink: (ml: number) => void;
}

interface RiskHydrationPlan {
  intervalMinutes: number;
  dailyTargetMl: number;
  perServingMl: number;
  needsElectrolytes: boolean;
  reminderEn: string;
  reminderAr: string;
}

interface CelebrationParticle {
  id: number;
  x: number;
  y: number;
  rotate: number;
  scale: number;
  color: string;
  delay: number;
  shape: 'circle' | 'rect' | 'diamond';
}

const CELEBRATION_PARTICLES: CelebrationParticle[] = [
  { id: 1, x: -120, y: -55, rotate: -140, scale: 1.1, color: '#173829', delay: 0, shape: 'diamond' },
  { id: 2, x: -95, y: 20, rotate: 95, scale: 0.9, color: '#16A34A', delay: 0.04, shape: 'circle' },
  { id: 3, x: -72, y: -75, rotate: 180, scale: 1.2, color: '#D97706', delay: 0.02, shape: 'rect' },
  { id: 4, x: -45, y: -42, rotate: -90, scale: 0.85, color: '#0EA5E9', delay: 0.06, shape: 'circle' },
  { id: 5, x: -24, y: -82, rotate: 145, scale: 1.15, color: '#F59E0B', delay: 0.03, shape: 'diamond' },
  { id: 6, x: 0, y: -68, rotate: -60, scale: 1.0, color: '#16A34A', delay: 0.05, shape: 'rect' },
  { id: 7, x: 26, y: -84, rotate: 120, scale: 1.1, color: '#0EA5E9', delay: 0.02, shape: 'circle' },
  { id: 8, x: 52, y: -48, rotate: -155, scale: 0.95, color: '#D97706', delay: 0.07, shape: 'diamond' },
  { id: 9, x: 78, y: -74, rotate: 85, scale: 1.2, color: '#173829', delay: 0.04, shape: 'rect' },
  { id: 10, x: 105, y: 15, rotate: -110, scale: 0.9, color: '#F59E0B', delay: 0.05, shape: 'circle' },
  { id: 11, x: 126, y: -50, rotate: 160, scale: 1.05, color: '#16A34A', delay: 0.01, shape: 'diamond' },
  { id: 12, x: -108, y: -12, rotate: 70, scale: 0.85, color: '#0EA5E9', delay: 0.08, shape: 'rect' },
  { id: 13, x: 92, y: -18, rotate: -80, scale: 1.0, color: '#D97706', delay: 0.06, shape: 'diamond' },
  { id: 14, x: 14, y: -35, rotate: 200, scale: 0.8, color: '#173829', delay: 0.09, shape: 'circle' },
];

function getHydrationPlanForRisk(evaluation: RiskEvaluation): RiskHydrationPlan {
  const effectiveCritical =
    evaluation.riskLevel === 'Critical' || evaluation.isMiddayBanActive;

  if (effectiveCritical) {
    return {
      intervalMinutes: 15,
      dailyTargetMl: 5000,
      perServingMl: 250,
      needsElectrolytes: true,
      reminderEn:
        'Critical Thermal Alert: Drink 250 ml cold water + electrolytes every 15 mins inside a shaded cooling hub.',
      reminderAr:
        'تنبيه إجهاد حرج: اشرب 250 مل ماء بارد مع أملاح التروية كل 15 دقيقة داخل منطقة تبريد مظللة.',
    };
  }

  if (evaluation.riskLevel === 'High') {
    return {
      intervalMinutes: 20,
      dailyTargetMl: 4000,
      perServingMl: 250,
      needsElectrolytes: true,
      reminderEn:
        'High Heat Reminder: Drink 250 ml cool water every 20 mins and replenish electrolytes.',
      reminderAr:
        'تذكير خطر مرتفع: اشرب 250 مل ماء بارد كل 20 دقيقة وعوّض الأملاح المعدنية.',
    };
  }

  if (evaluation.riskLevel === 'Moderate') {
    return {
      intervalMinutes: 30,
      dailyTargetMl: 3000,
      perServingMl: 250,
      needsElectrolytes: false,
      reminderEn:
        'Moderate Heat Reminder: Sip 250 ml water every 30 mins even before feeling thirsty.',
      reminderAr:
        'تذكير حرارة متوسطة: اشرب 250 مل ماء كل 30 دقيقة بانتظام قبل الشعور بالعطش.',
    };
  }

  return {
    intervalMinutes: 45,
    dailyTargetMl: 2500,
    perServingMl: 250,
    needsElectrolytes: false,
    reminderEn:
      'Low Heat Baseline: Maintain steady hydration with 250 ml water every 45 mins.',
    reminderAr:
      'مستوى منخفض: حافظ على شرب 250 مل من الماء كل 45 دقيقة طوال المناوبة.',
  };
}

export const HydrationTrackerWidget: React.FC<HydrationTrackerWidgetProps> = ({
  evaluation,
  role,
  locale,
  waterMl,
  electrolytesCount,
  hydrationStreak,
  goalStreakDays = 4,
  lastLoggedTime,
  onLogDrink,
  onUndoDrink,
}) => {
  const isAr = locale === 'ar';
  const prefersReducedMotion = useReducedMotion();
  const plan = useMemo(() => getHydrationPlanForRisk(evaluation), [evaluation]);

  const [secondsToReminder, setSecondsToReminder] = useState<number>(
    plan.intervalMinutes * 60
  );
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isReminderDue, setIsReminderDue] = useState<boolean>(false);
  const [showCelebrationBurst, setShowCelebrationBurst] = useState<boolean>(false);

  const isGoalMet = waterMl >= plan.dailyTargetMl;
  const prevGoalMetRef = useRef<boolean>(isGoalMet);
  const celebrationTimerRef = useRef<number | null>(null);

  // Trigger celebratory animation & chime when crossing the daily hydration goal
  const triggerCelebration = () => {
    setShowCelebrationBurst(true);
    if (soundEnabled) {
      playCelebrationChime();
    }
    if (celebrationTimerRef.current) {
      window.clearTimeout(celebrationTimerRef.current);
    }
    celebrationTimerRef.current = window.setTimeout(() => {
      setShowCelebrationBurst(false);
    }, 2400);
  };

  useEffect(() => {
    if (isGoalMet && !prevGoalMetRef.current) {
      triggerCelebration();
    } else if (!isGoalMet) {
      setShowCelebrationBurst(false);
    }
    prevGoalMetRef.current = isGoalMet;
  }, [isGoalMet]);

  useEffect(() => {
    return () => {
      if (celebrationTimerRef.current) {
        window.clearTimeout(celebrationTimerRef.current);
      }
    };
  }, []);

  // Automatically tighten reminder timer when heat risk level escalates
  useEffect(() => {
    const maxIntervalSecs = plan.intervalMinutes * 60;
    setSecondsToReminder((prev) => (prev > maxIntervalSecs ? maxIntervalSecs : prev));
  }, [plan.intervalMinutes]);

  // Countdown tick for risk-adaptive hydration reminders
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsToReminder((prev) => {
        if (prev <= 1) {
          setIsReminderDue(true);
          if (soundEnabled) {
            const urgency =
              evaluation.riskLevel === 'Critical'
                ? 'critical'
                : evaluation.riskLevel === 'High'
                ? 'high'
                : 'moderate';
            playAlertChime(urgency);
          }
          return plan.intervalMinutes * 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [plan.intervalMinutes, evaluation.riskLevel, soundEnabled]);

  const handleDrinkAction = (ml: number, isElectrolyte: boolean = false) => {
    onLogDrink(ml, isElectrolyte, !isReminderDue);
    setSecondsToReminder(plan.intervalMinutes * 60);
    setIsReminderDue(false);
  };

  const handleTestReminder = () => {
    setIsReminderDue(true);
    if (soundEnabled) {
      playAlertChime(
        evaluation.riskLevel === 'Critical'
          ? 'critical'
          : evaluation.riskLevel === 'High'
          ? 'high'
          : 'moderate'
      );
    }
  };

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const cupsLogged = Math.round(waterMl / 250);
  const targetCups = Math.round(plan.dailyTargetMl / 250);
  const progressPct = Math.min(100, Math.round((waterMl / plan.dailyTargetMl) * 100));
  const remainingMl = Math.max(0, plan.dailyTargetMl - waterMl);
  const remainingCups = Math.ceil(remainingMl / 250);
  const bonusMl = Math.max(0, waterMl - plan.dailyTargetMl);
  const effectiveGoalDays = goalStreakDays + (isGoalMet ? 1 : 0);

  const isHighOrCritical =
    evaluation.riskLevel === 'High' ||
    evaluation.riskLevel === 'Critical' ||
    evaluation.isMiddayBanActive;

  return (
    <div
      className={`relative overflow-hidden bg-white border rounded-2xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between h-full space-y-4 ${
        isGoalMet ? 'border-[#16A34A]/50' : 'border-[#e5dfd3]'
      }`}
    >
      {/* Celebratory Confetti & Droplet Burst Overlay */}
      <AnimatePresence>
        {showCelebrationBurst && !prefersReducedMotion && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-20 flex justify-center z-20 overflow-visible"
          >
            {CELEBRATION_PARTICLES.map((particle) => (
              <motion.span
                key={particle.id}
                initial={{ opacity: 0, x: 0, y: 0, scale: 0.3, rotate: 0 }}
                animate={{
                  opacity: [0, 1, 1, 0],
                  x: particle.x,
                  y: particle.y,
                  scale: [0.3, particle.scale, particle.scale * 0.9, 0.4],
                  rotate: particle.rotate,
                }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: 1.55,
                  delay: particle.delay,
                  ease: [0.16, 1, 0.3, 1],
                }}
                style={{ backgroundColor: particle.color }}
                className={`absolute block w-2.5 h-2.5 will-change-transform ${
                  particle.shape === 'circle'
                    ? 'rounded-full'
                    : particle.shape === 'diamond'
                    ? 'rounded-[2px] rotate-45'
                    : 'rounded-[2px] w-3 h-1.5'
                }`}
              />
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* Header Row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center space-x-2.5 rtl:space-x-reverse min-w-0">
          <div
            className={`p-2.5 rounded-xl shrink-0 transition-colors ${
              isGoalMet ? 'bg-[#DCFCE7] text-[#15803D]' : 'bg-[#edf4f0] text-[#173829]'
            }`}
          >
            {isGoalMet ? (
              <Award className="w-5 h-5 text-[#15803D]" />
            ) : (
              <GlassWater className="w-5 h-5 text-[#173829]" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-sm text-[#173829] truncate">
              {isAr
                ? role === 'rider'
                  ? 'متتبع شرب الماء لسائق التوصيل'
                  : 'متتبع التروية الميداني الذكي'
                : role === 'rider'
                ? 'Rider Hydration & Cooling Reminder'
                : 'Smart Hydration Tracker'}
            </h3>
            <p className="text-xs text-[#426050] truncate">
              {isAr
                ? `الهدف (${evaluation.riskLevel}): ${plan.dailyTargetMl} مل · تذكير كل ${plan.intervalMinutes} دقيقة`
                : `Goal (${evaluation.riskLevel}): ${plan.dailyTargetMl} ml · Every ${plan.intervalMinutes} mins`}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setSoundEnabled((v) => !v)}
          title={
            soundEnabled
              ? isAr
                ? 'كتم صوت التذكير'
                : 'Mute reminder chime'
              : isAr
              ? 'تفعيل صوت التذكير'
              : 'Enable reminder chime'
          }
          className={`p-2 rounded-xl border text-xs transition-colors cursor-pointer shrink-0 ${
            soundEnabled
              ? 'bg-[#EBF5F0] text-[#173829] border-[#C5DFD0]'
              : 'bg-[#FAF8F3] text-[#6C8D7B] border-[#DDD4C3]'
          }`}
        >
          {soundEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
        </button>
      </div>

      {/* Celebratory Banner When Daily Goal Is Met OR Heat-Risk Adaptive Reminder */}
      <AnimatePresence mode="wait">
        {isGoalMet ? (
          <motion.div
            key="goal-met-banner"
            initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.94, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            className="p-3 rounded-xl border border-[#86EFAC] bg-gradient-to-r from-[#DCFCE7] via-[#EBF5F0] to-[#FEF7DA] text-[#14532D] text-xs flex items-center justify-between gap-2.5 shadow-xs"
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <motion.div
                animate={
                  prefersReducedMotion
                    ? undefined
                    : showCelebrationBurst
                    ? { rotate: [0, -12, 12, -8, 8, 0], scale: [1, 1.2, 1] }
                    : undefined
                }
                transition={{ duration: 0.7 }}
                className="p-1.5 rounded-lg bg-white/80 border border-[#86EFAC] shrink-0 text-[#15803D]"
              >
                <Sparkles className="w-4 h-4" />
              </motion.div>
              <div className="min-w-0">
                <p className="font-extrabold text-[#14532D] leading-snug">
                  {isAr
                    ? 'أحسنت! اكتمل هدف التروية اليومي بنجاح'
                    : 'Daily Hydration Goal Met! Great job'}
                </p>
                <p className="text-[11px] text-[#166534] font-medium mt-0.5">
                  {isAr
                    ? `تم تمديد سلسلة الإنجاز إلى ${effectiveGoalDays} أيام متتالية${bonusMl > 0 ? ` (+${bonusMl} مل إضافي)` : ''}.`
                    : `${effectiveGoalDays}-day goal streak active${bonusMl > 0 ? ` · +${bonusMl} ml extra logged` : ''}. Keep sipping in heat.`}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={triggerCelebration}
              className="px-2.5 py-1 rounded-lg bg-white/90 hover:bg-white border border-[#86EFAC] text-[#15803D] font-bold text-[11px] whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              {isAr ? 'احتفال' : 'Celebrate'}
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="reminder-banner"
            initial={false}
            animate={{ opacity: 1 }}
            className={`p-3 rounded-xl border text-xs leading-relaxed flex items-start justify-between gap-2.5 ${
              isReminderDue
                ? 'bg-[#FFF5F5] border-[#C81D25] text-[#991B1B] font-bold'
                : isHighOrCritical
                ? 'bg-[#FEF3C7] border-[#FCD34D] text-[#78350F] font-semibold'
                : 'bg-[#EBF5F0] border-[#C5DFD0] text-[#173829] font-medium'
            }`}
          >
            <div className="flex items-start gap-2">
              {isReminderDue || isHighOrCritical ? (
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#C81D25]" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#173829]" />
              )}
              <span>
                {isReminderDue
                  ? isAr
                    ? `حان وقت شرب ${plan.perServingMl} مل ماء الآن! اضغط لتسجيل الكوب.`
                    : `Hydration Due Now: Drink ${plan.perServingMl} ml water now and tap below to log.`
                  : isAr
                  ? plan.reminderAr
                  : plan.reminderEn}
              </span>
            </div>

            {!isReminderDue && (
              <button
                type="button"
                onClick={handleTestReminder}
                className="text-[11px] font-bold underline shrink-0 opacity-80 hover:opacity-100 cursor-pointer whitespace-nowrap"
              >
                {isAr ? 'تنبيه' : 'Remind'}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Intake Progress Bar, Goal Proximity & Streak Summary */}
      <div className="space-y-2.5">
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="text-2xl font-black text-[#173829] font-mono tabular-nums">
              {waterMl}
            </span>
            <span className="text-[#426050] font-semibold truncate">
              / {plan.dailyTargetMl} ml ({cupsLogged}/{targetCups}{' '}
              {isAr ? 'أكواب' : 'cups'})
            </span>
          </div>
          <span
            className={`font-mono font-black text-sm tabular-nums shrink-0 ${
              isGoalMet ? 'text-[#15803D]' : 'text-[#173829]'
            }`}
          >
            {progressPct}%
          </span>
        </div>

        {/* Continuous Progress Bar with 25% / 50% / 75% Milestone Ticks */}
        <div
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={isAr ? 'تقدم شرب الماء اليومي' : 'Daily hydration goal progress'}
          className="relative w-full h-3.5 rounded-full bg-[#eae4d5] overflow-hidden"
        >
          <motion.div
            initial={false}
            animate={{ scaleX: progressPct / 100 }}
            transition={
              prefersReducedMotion
                ? { duration: 0 }
                : { type: 'spring', stiffness: 160, damping: 22 }
            }
            style={{ transformOrigin: isAr ? 'right center' : 'left center' }}
            className={`h-full w-full rounded-full relative overflow-hidden will-change-transform ${
              isGoalMet
                ? 'bg-gradient-to-r from-[#173829] via-[#15803D] to-[#16A34A]'
                : isHighOrCritical
                ? 'bg-gradient-to-r from-[#173829] to-[#24533D]'
                : 'bg-[#173829]'
            }`}
          >
            {isGoalMet && !prefersReducedMotion && (
              <motion.div
                aria-hidden="true"
                initial={{ x: '-100%' }}
                animate={{ x: '220%' }}
                transition={{
                  repeat: Infinity,
                  repeatDelay: 2.2,
                  duration: 1.1,
                  ease: 'easeInOut',
                }}
                className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/35 to-transparent"
              />
            )}
          </motion.div>

          {/* Quarter Milestone Markers */}
          <span
            aria-hidden="true"
            className="absolute top-0 bottom-0 left-1/4 w-px bg-white/60 pointer-events-none"
          />
          <span
            aria-hidden="true"
            className="absolute top-0 bottom-0 left-1/2 w-px bg-white/60 pointer-events-none"
          />
          <span
            aria-hidden="true"
            className="absolute top-0 bottom-0 left-3/4 w-px bg-white/60 pointer-events-none"
          />
        </div>

        {/* Proximity to Goal Line */}
        <div className="flex items-center justify-between text-[11px] text-[#426050] font-medium">
          <span>
            {isGoalMet
              ? isAr
                ? `الهدف مكتمل (${progressPct}%)`
                : `100% of daily target reached`
              : isAr
              ? `متبقي ${remainingMl} مل (${remainingCups} ${remainingCups === 1 ? 'كوب' : 'أكواب'}) للوصول للهدف`
              : `${remainingMl} ml (${remainingCups} ${remainingCups === 1 ? 'cup' : 'cups'}) left to reach goal`}
          </span>
          <span className="font-mono tabular-nums text-[#173829] font-bold">
            {isAr ? `${cupsLogged} من ${targetCups}` : `${cupsLogged} of ${targetCups} cups`}
          </span>
        </div>

        {/* 3-Column Metrics Strip: Next Drink Timer, Hydration Streak, Electrolytes */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <div className="px-2.5 py-2 rounded-xl bg-[#FAF8F3] border border-[#E5DFD3] flex flex-col justify-between gap-0.5 text-xs">
            <span className="flex items-center gap-1 text-[#426050] text-[11px] truncate">
              <Clock className="w-3.5 h-3.5 text-[#173829] shrink-0" />
              <span className="truncate">{isAr ? 'التذكير' : 'Next drink'}</span>
            </span>
            <span className="font-mono font-bold text-[#173829] tabular-nums text-xs">
              {formatCountdown(secondsToReminder)}
            </span>
          </div>

          <div
            className={`px-2.5 py-2 rounded-xl border flex flex-col justify-between gap-0.5 text-xs transition-colors ${
              isGoalMet
                ? 'bg-[#FEF7DA] border-[#FCD34D]'
                : 'bg-[#FAF8F3] border-[#E5DFD3]'
            }`}
          >
            <span className="flex items-center gap-1 text-[#426050] text-[11px] truncate">
              <Flame
                className={`w-3.5 h-3.5 shrink-0 ${
                  hydrationStreak > 0 ? 'text-[#D97706]' : 'text-[#6C8D7B]'
                }`}
              />
              <span className="truncate">{isAr ? 'السلسلة' : 'Streak'}</span>
            </span>
            <motion.span
              key={`${effectiveGoalDays}-${hydrationStreak}`}
              initial={prefersReducedMotion ? false : { scale: 1.15 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 18 }}
              className="font-mono font-bold text-[#173829] tabular-nums text-xs inline-block"
            >
              {isAr
                ? `${effectiveGoalDays}ي · ${hydrationStreak}×`
                : `${effectiveGoalDays}d · ${hydrationStreak}x`}
            </motion.span>
          </div>

          <div className="px-2.5 py-2 rounded-xl bg-[#FAF8F3] border border-[#E5DFD3] flex flex-col justify-between gap-0.5 text-xs">
            <span className="flex items-center gap-1 text-[#426050] text-[11px] truncate">
              <Zap className="w-3.5 h-3.5 text-[#B45309] shrink-0" />
              <span className="truncate">{isAr ? 'أملاح' : 'Electrolytes'}</span>
            </span>
            <span className="font-mono font-bold text-[#173829] tabular-nums text-xs">
              {electrolytesCount}x
            </span>
          </div>
        </div>
      </div>

      {/* Interactive Drink Logging Buttons */}
      <div className="space-y-2 pt-2 border-t border-[#ece6da]">
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => handleDrinkAction(250, false)}
            className="py-2.5 px-2 rounded-xl bg-[#173829] hover:bg-[#24533d] text-[#f7f5ee] font-bold text-xs transition-colors shadow-xs flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span>{isAr ? '250 مل كوب' : '250 ml Cup'}</span>
          </button>

          <button
            type="button"
            onClick={() => handleDrinkAction(500, false)}
            className="py-2.5 px-2 rounded-xl bg-[#EBF5F0] hover:bg-[#D5E5DC] text-[#173829] border border-[#C5DFD0] font-bold text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span>{isAr ? '500 مل عبوة' : '500 ml Bottle'}</span>
          </button>

          <button
            type="button"
            onClick={() => handleDrinkAction(250, true)}
            className="py-2.5 px-2 rounded-xl bg-[#FEF7DA] hover:bg-[#FDE68A] text-[#78350F] border border-[#FCD34D] font-bold text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
          >
            <Zap className="w-3.5 h-3.5 shrink-0" />
            <span>{isAr ? 'أملاح 250' : 'Electrolyte'}</span>
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 text-[11px] text-[#426050]">
          <span className="truncate">
            {isGoalMet
              ? isAr
                ? `سلسلة يومية: ${effectiveGoalDays} أيام${lastLoggedTime ? ` · آخر شرب ${lastLoggedTime}` : ''}`
                : `${effectiveGoalDays}-day goal streak${lastLoggedTime ? ` · Last logged ${lastLoggedTime}` : ''}`
              : isAr
              ? `سلسلة منتظمة: ${hydrationStreak} مرات${lastLoggedTime ? ` · آخر شرب ${lastLoggedTime}` : ''}`
              : `${hydrationStreak} on-time sips in a row${lastLoggedTime ? ` · Last logged ${lastLoggedTime}` : ''}`}
          </span>

          {waterMl > 0 && (
            <button
              type="button"
              onClick={() => onUndoDrink(250)}
              className="flex items-center gap-0.5 text-[#426050] hover:text-[#173829] font-bold underline cursor-pointer shrink-0 whitespace-nowrap"
            >
              <Minus className="w-3 h-3" />
              <span>{isAr ? 'تراجع 250 مل' : 'Undo 250 ml'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
