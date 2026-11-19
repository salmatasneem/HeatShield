import React, { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Flame, ThermometerSun, Droplets, Activity, Clock } from 'lucide-react';
import { ComplianceConfig } from '../../config/complianceConfig';
import { EnvWeatherState } from '../../types/occupational';
import { AppLocale } from '../../utils/i18n';

interface Forecast24hChartCardProps {
  locale: AppLocale;
  weather: EnvWeatherState;
  config: ComplianceConfig;
}

interface ChartPoint {
  hourLabel: string;
  hourIndex: number;
  airTempC: number;
  relativeHumidityPct: number;
  wbgtEstimatedC: number;
  heatIndexEstimatedC: number;
  isPeakRisk: boolean;
}

export const Forecast24hChartCard: React.FC<Forecast24hChartCardProps> = ({
  locale,
  weather,
  config,
}) => {
  const isAr = locale === 'ar';
  const [showTemp, setShowTemp] = useState(true);
  const [showHumidity, setShowHumidity] = useState(true);
  const [showWbgt, setShowWbgt] = useState(true);

  const triggers = config?.escalationTriggers || {
    advisoryWbgtC: 27.5,
    restrictWbgtC: 29.5,
    stopWorkWbgtC: 32.0,
    lookAheadHours: 3,
    ruleName: 'Site Action Escalation Triggers',
  };

  const chartData: ChartPoint[] = useMemo(() => {
    return weather.hourly.map((h) => ({
      hourLabel: h.hourLabel,
      hourIndex: h.hourIndex,
      airTempC: Number(h.airTempC.toFixed(1)),
      relativeHumidityPct: Math.round(h.relativeHumidityPct),
      wbgtEstimatedC: Number(h.wbgtEstimatedC.toFixed(1)),
      heatIndexEstimatedC: Number(h.heatIndexEstimatedC.toFixed(1)),
      isPeakRisk: h.wbgtEstimatedC >= triggers.restrictWbgtC,
    }));
  }, [weather.hourly, triggers.restrictWbgtC]);

  const peakSummary = useMemo(() => {
    if (chartData.length === 0) {
      return {
        peakWbgt: 0,
        peakWbgtHour: '--:--',
        peakTemp: 0,
        peakTempHour: '--:--',
        restrictHoursCount: 0,
      };
    }
    let maxWbgt = chartData[0];
    let maxTemp = chartData[0];
    let restrictCount = 0;

    for (const pt of chartData) {
      if (pt.wbgtEstimatedC > maxWbgt.wbgtEstimatedC) maxWbgt = pt;
      if (pt.airTempC > maxTemp.airTempC) maxTemp = pt;
      if (pt.wbgtEstimatedC >= triggers.restrictWbgtC) restrictCount++;
    }

    return {
      peakWbgt: maxWbgt.wbgtEstimatedC,
      peakWbgtHour: maxWbgt.hourLabel,
      peakTemp: maxTemp.airTempC,
      peakTempHour: maxTemp.hourLabel,
      restrictHoursCount: restrictCount,
    };
  }, [chartData, triggers.restrictWbgtC]);

  const currentHourLabel = weather.current.hourLabel;

  return (
    <div className="bg-white border border-[#e5dfd3] rounded-2xl p-5 sm:p-6 shadow-xs hover:shadow-md transition-shadow space-y-4">
      {/* Header Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-[#ece6da]">
        <div className="flex items-start gap-2.5">
          <div className="p-2.5 rounded-xl bg-[#edf4f0] text-[#173829] shrink-0">
            <Activity className="w-5 h-5 text-[#173829]" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-black text-base text-[#173829]">
                {isAr
                  ? 'توقعات 24 ساعة: الحرارة والرطوبة ومؤشر WBGT التقديري'
                  : '24-Hour Thermal Forecast: Temp, Humidity & Calculated WBGT'}
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#f7f5ee] border border-[#e2dcd0] text-[#426050]">
                {isAr ? 'بيانات Open-Meteo (تقديرية)' : 'Open-Meteo Hourly (Estimated)'}
              </span>
            </div>
            <p className="text-xs text-[#426050] mt-0.5">
              {isAr
                ? 'راقب ساعات الذروة الحرارية ونافذة حظر الظهيرة (12:30–15:00) لإعادة جدولة المهام الشاقة مبكراً.'
                : 'Spot peak WBGT risk windows and the 12:30–15:00 MOHRE Midday Break zone to shift heavy tasks earlier.'}
            </p>
          </div>
        </div>

        {/* Peak Risk Quick Spotter Pills */}
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <div className="px-2.5 py-1.5 rounded-xl bg-[#fff5f5] border border-[#fca5a5] text-[#991b1b] font-bold flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-[#c81d25]" />
            <span>
              {isAr ? 'ذروة WBGT:' : 'Peak WBGT:'}{' '}
              <span className="font-mono">
                {peakSummary.peakWbgt.toFixed(1)}°C @ {peakSummary.peakWbgtHour}
              </span>
            </span>
          </div>
          <div className="px-2.5 py-1.5 rounded-xl bg-[#fef3c7] border border-[#fde68a] text-[#92400e] font-bold flex items-center gap-1.5">
            <ThermometerSun className="w-3.5 h-3.5 text-[#d97706]" />
            <span>
              {isAr ? 'ذروة الحرارة:' : 'Peak Air:'}{' '}
              <span className="font-mono">
                {peakSummary.peakTemp.toFixed(1)}°C @ {peakSummary.peakTempHour}
              </span>
            </span>
          </div>
          <div className="px-2.5 py-1.5 rounded-xl bg-[#f7f5ee] border border-[#e2dcd0] text-[#173829] font-bold flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-[#24533d]" />
            <span>
              {isAr ? 'ساعات التقييد:' : 'Restrict+ Hours:'}{' '}
              <span className="font-mono">{peakSummary.restrictHoursCount}h</span>
            </span>
          </div>
        </div>
      </div>

      {/* Series Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowWbgt((v) => !v)}
            className={`px-3 py-1.5 rounded-xl font-bold border flex items-center gap-1.5 cursor-pointer transition-all ${
              showWbgt
                ? 'bg-[#fff5f5] border-[#c81d25] text-[#991b1b]'
                : 'bg-[#f7f5ee] border-[#e2dcd0] text-[#6c8d7b] opacity-70'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-[#c81d25]" />
            <span>{isAr ? 'WBGT المحسوب (°م)' : 'Calculated WBGT (est. °C)'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowTemp((v) => !v)}
            className={`px-3 py-1.5 rounded-xl font-bold border flex items-center gap-1.5 cursor-pointer transition-all ${
              showTemp
                ? 'bg-[#fef3c7] border-[#d97706] text-[#92400e]'
                : 'bg-[#f7f5ee] border-[#e2dcd0] text-[#6c8d7b] opacity-70'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-[#d97706]" />
            <span>{isAr ? 'درجة الحرارة (°م)' : 'Temperature (°C)'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowHumidity((v) => !v)}
            className={`px-3 py-1.5 rounded-xl font-bold border flex items-center gap-1.5 cursor-pointer transition-all ${
              showHumidity
                ? 'bg-[#e0f2fe] border-[#0284c7] text-[#075985]'
                : 'bg-[#f7f5ee] border-[#e2dcd0] text-[#6c8d7b] opacity-70'
            }`}
          >
            <Droplets className="w-3.5 h-3.5 text-[#0284c7]" />
            <span>{isAr ? 'الرطوبة النسبية (%)' : 'Humidity (%)'}</span>
          </button>
        </div>

        <div className="text-[11px] font-medium text-[#426050]">
          {isAr
            ? `حد التقييد: ${triggers.restrictWbgtC}°م · حد الإيقاف: ${triggers.stopWorkWbgtC}°م`
            : `Restrict: ${triggers.restrictWbgtC}°C · Stop-work: ${triggers.stopWorkWbgtC}°C · Shaded zone: Midday Break`}
        </div>
      </div>

      {/* Recharts 24-Hour Forecast Chart */}
      <div className="w-full h-72 sm:h-80 bg-[#FAF8F3] border border-[#e5dfd3] rounded-xl p-2 sm:p-4" dir="ltr">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart data={chartData} margin={{ top: 14, right: 16, left: 0, bottom: 6 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5dfd3" />
            <XAxis
              dataKey="hourLabel"
              tick={{ fill: '#426050', fontSize: 11, fontWeight: 600 }}
              interval={2}
              stroke="#c9c0ae"
            />
            <YAxis
              yAxisId="temp"
              domain={[18, 52]}
              tick={{ fill: '#173829', fontSize: 11, fontWeight: 600 }}
              stroke="#c9c0ae"
              unit="°C"
              width={48}
            />
            <YAxis
              yAxisId="humidity"
              orientation="right"
              domain={[0, 100]}
              tick={{ fill: '#0284c7', fontSize: 11, fontWeight: 600 }}
              stroke="#bae6fd"
              unit="%"
              width={44}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#FAF8F3',
                borderColor: '#173829',
                borderRadius: '12px',
                fontSize: '12px',
                color: '#173829',
                boxShadow: '0 8px 24px rgba(23, 56, 41, 0.12)',
              }}
              labelStyle={{ fontWeight: 800, color: '#173829', marginBottom: '4px' }}
              formatter={(value: any, name: any) => {
                if (name === 'Humidity (%)') return [`${value}%`, name];
                return [`${Number(value).toFixed(1)}°C`, name];
              }}
            />
            <Legend wrapperStyle={{ fontSize: '12px', fontWeight: 700, paddingTop: '6px' }} />

            {/* Midday Break Shaded Reference Window (12:00 - 15:00) */}
            {chartData.some((d) => d.hourLabel === '12:00') &&
              chartData.some((d) => d.hourLabel === '15:00') && (
                <ReferenceArea
                  yAxisId="temp"
                  x1="12:00"
                  x2="15:00"
                  fill="#fee2e2"
                  fillOpacity={0.55}
                  ifOverflow="extendDomain"
                />
              )}

            {/* Current Site Hour Vertical Marker */}
            {chartData.some((d) => d.hourLabel === currentHourLabel) && (
              <ReferenceLine
                yAxisId="temp"
                x={currentHourLabel}
                stroke="#173829"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: 'Now',
                  position: 'top',
                  fill: '#173829',
                  fontSize: 10,
                  fontWeight: 800,
                }}
              />
            )}

            {/* Threshold Reference Lines for Estimated WBGT */}
            <ReferenceLine
              yAxisId="temp"
              y={triggers.restrictWbgtC}
              stroke="#ea580c"
              strokeDasharray="5 5"
              label={{
                value: `Restrict ${triggers.restrictWbgtC}°C`,
                position: 'insideBottomLeft',
                fill: '#9a3412',
                fontSize: 10,
                fontWeight: 700,
              }}
            />
            <ReferenceLine
              yAxisId="temp"
              y={triggers.stopWorkWbgtC}
              stroke="#c81d25"
              strokeDasharray="3 3"
              label={{
                value: `Stop ${triggers.stopWorkWbgtC}°C`,
                position: 'insideTopLeft',
                fill: '#991b1b',
                fontSize: 10,
                fontWeight: 700,
              }}
            />

            {showTemp && (
              <Line
                yAxisId="temp"
                type="monotone"
                dataKey="airTempC"
                name="Air Temp (°C)"
                stroke="#d97706"
                strokeWidth={2.5}
                dot={{ r: 2.5, fill: '#d97706' }}
                activeDot={{ r: 5 }}
              />
            )}

            {showWbgt && (
              <Line
                yAxisId="temp"
                type="monotone"
                dataKey="wbgtEstimatedC"
                name="Calculated WBGT (est. °C)"
                stroke="#c81d25"
                strokeWidth={3}
                dot={{ r: 3, fill: '#c81d25' }}
                activeDot={{ r: 6 }}
              />
            )}

            {showHumidity && (
              <Line
                yAxisId="humidity"
                type="monotone"
                dataKey="relativeHumidityPct"
                name="Humidity (%)"
                stroke="#0284c7"
                strokeWidth={2}
                strokeDasharray="4 2"
                dot={{ r: 2, fill: '#0284c7' }}
                activeDot={{ r: 5 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
