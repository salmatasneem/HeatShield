import {
  CrewRosterRow,
  EnvWeatherState,
  SchedulePlanResult,
} from '../types/occupational';
import { playAlertChime, playTtsOrFallback, stopAllSpeech } from '../utils/speech';

/**
 * Formats an approved or draft crew work-rest schedule into concise WhatsApp-ready text.
 * Contains zero worker names or personal data.
 */
export function formatWhatsAppScheduleText(
  plan: SchedulePlanResult,
  weather: EnvWeatherState,
  roster: CrewRosterRow[],
  locale: 'en' | 'ar'
): string {
  const isAr = locale === 'ar';
  const lines: string[] = [];

  if (isAr) {
    lines.push(`*جدول السلامة الحرارية — ${weather.site.nameAr}*`);
    lines.push(
      `الطقس الحالي: ${weather.current.airTempC.toFixed(1)}°م | الرطوبة ${weather.current.relativeHumidityPct}% | مؤشر WBGT التقديري ${weather.current.wbgtEstimatedC.toFixed(1)}°م`
    );
    lines.push(`حالة الامتثال: ${plan.overallComplianceStatus} (تم التحقق عبر محرك القواعد)`);
    lines.push(`حظر الظهيرة الإلزامي: 12:30 – 15:00 (توقف العمل تحت الشمس المباشرة)`);
    lines.push('');
    for (const crew of roster) {
      const crewBlocks = plan.blocks.filter((b) => b.crew_id === crew.crew_id);
      const breakHours = crewBlocks.filter((b) => b.restMinutes > 0).map((b) => `${b.timeRange.split('–')[0]}(${b.workMinutes}/${b.restMinutes}د)`);
      lines.push(`• *${crew.crew_id}* (${crew.taskType} - ${crew.exposure}):`);
      lines.push(`  دورات الراحة: ${breakHours.slice(0, 5).join('، ') || 'تتبع الجدول القياسي'}`);
    }
    lines.push('');
    lines.push(`تنبيه: إرشاد بيئي آلي فقط، وليس تشخيصاً طبياً. الطوارئ بالإمارات: 998`);
  } else {
    lines.push(`*HEATSHIELD WORK-REST BRIEF — ${weather.site.name}*`);
    lines.push(
      `Live Env: ${weather.current.airTempC.toFixed(1)}°C | RH ${weather.current.relativeHumidityPct}% | Est. WBGT ${weather.current.wbgtEstimatedC.toFixed(1)}°C | Heat Index est. ${weather.current.heatIndexEstimatedC.toFixed(1)}°C`
    );
    lines.push(`Compliance: ${plan.overallComplianceStatus} (Validated by compliance engine)`);
    lines.push(`UAE MOHRE Midday Break: 12:30–15:00 (Zero direct-sun outdoor work)`);
    lines.push('');
    for (const crew of roster) {
      const crewBlocks = plan.blocks.filter((b) => b.crew_id === crew.crew_id);
      const highRestHours = crewBlocks
        .filter((b) => b.restMinutes > 0)
        .map((b) => `${b.timeRange.split('–')[0]}(${b.workMinutes}/${b.restMinutes}m)`);
      lines.push(`• *${crew.crew_id}* — ${crew.taskType} [${crew.workload}/${crew.exposure}]`);
      lines.push(`  Schedule: ${highRestHours.slice(0, 6).join(', ') || '60m continuous'}`);
    }
    lines.push('');
    lines.push(`Notice: Automated environmental guidance only. Not medical diagnosis. UAE Emergency: 998.`);
  }

  return lines.join('\n');
}

/**
 * Generates an anonymized site-level compliance CSV report for download.
 */
export function exportScheduleComplianceCsv(
  plan: SchedulePlanResult,
  weather: EnvWeatherState
): string {
  const headers = [
    'site_name',
    'crew_id',
    'time_range',
    'task_type',
    'workload',
    'exposure',
    'wbgt_estimated_c',
    'heat_index_estimated_c',
    'work_minutes',
    'rest_minutes',
    'rest_location',
    'hydration_ml_per_hour',
    'compliance_status',
    'triggered_rules',
  ];

  const checkByBlockId = new Map(plan.complianceChecks.map((c) => [c.blockId, c]));
  const rows = plan.blocks.map((b) => {
    const check = checkByBlockId.get(b.id);
    return [
      `"${weather.site.name.replace(/"/g, '""')}"`,
      b.crew_id,
      b.timeRange,
      `"${b.taskType.replace(/"/g, '""')}"`,
      b.workload,
      b.exposure,
      b.wbgtEstimatedC.toFixed(1),
      b.heatIndexEstimatedC.toFixed(1),
      String(b.workMinutes),
      String(b.restMinutes),
      b.restLocation,
      String(b.hydrationMlPerHour),
      check?.status || 'Compliant',
      `"${(check?.triggeredRules || []).join('; ').replace(/"/g, '""')}"`,
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

export function triggerCsvDownload(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Speaks an occupational heat & break alert in English or Arabic using Gemini TTS / Web Speech fallback.
 */
export async function broadcastVoiceScheduleAlert(params: {
  locale: 'en' | 'ar';
  weather: EnvWeatherState;
  plan: SchedulePlanResult;
  onStart?: () => void;
  onEnd?: () => void;
}): Promise<void> {
  const { locale, weather, plan, onStart, onEnd } = params;
  const risk = weather.current.riskLevel;

  playAlertChime(risk === 'Critical' ? 'critical' : risk === 'High' ? 'high' : 'moderate');

  const middayCount = plan.blocks.filter((b) => b.isMiddayBreakWindow && b.workMinutes === 0).length;
  const text =
    locale === 'ar'
      ? `تنبيه السلامة الحرارية لموقع ${weather.site.nameAr}. مؤشر الحرارة الرطبة التقديري ${weather.current.wbgtEstimatedC.toFixed(1)} درجة مئوية. يرجى الالتزام بفترات الراحة المظللة وشرب الماء البارد كل خمس عشرة دقيقة، والالتزام التام بحظر الظهيرة من الثانية عشرة والنصف حتى الثالثة عصراً.`
      : `HeatShield coordinator alert for ${weather.site.name}. Estimated WBGT is ${weather.current.wbgtEstimatedC.toFixed(1)} degrees Celsius with ${risk} heat risk. Enforce scheduled work-rest ratios, cold water hydration every 15 minutes, and ${middayCount > 0 ? 'mandatory 12:30 to 15:00 midday break shaded rest.' : 'shaded cooling recovery.'}`;

  await playTtsOrFallback(text, locale, onStart, onEnd, 1.0);
}

export function stopVoiceScheduleAlert(): void {
  stopAllSpeech();
}
