import { ExposureType } from '../config/complianceConfig';
import { EstimatedRiskLevel, HourlyEnvMetric } from '../types/occupational';

export interface ThermalEstimateInput {
  airTempC: number;
  relativeHumidityPct: number;
  windSpeedKmh: number;
  solarRadiationWm2: number;
  exposure?: ExposureType;
}

export interface ThermalEstimateOutput {
  wetBulbEstimatedC: number;
  globeTempEstimatedC: number;
  wbgtEstimatedC: number;
  heatIndexEstimatedC: number;
  riskLevel: EstimatedRiskLevel;
  isEstimated: true;
}

/**
 * Stull (2011) empirical approximation of wet-bulb temperature from dry-bulb T (°C) and RH (%).
 */
export function computeStullWetBulbC(airTempC: number, rhPct: number): number {
  const rh = Math.max(5, Math.min(100, rhPct));
  const tw =
    airTempC * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
    Math.atan(airTempC + rh) -
    Math.atan(rh - 1.676331) +
    0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) -
    4.686035;
  return Number(tw.toFixed(1));
}

/**
 * NOAA / Rothfusz & Steadman Heat Index (estimated) returned in °C.
 */
export function computeHeatIndexEstimatedC(airTempC: number, rhPct: number): number {
  const rh = Math.max(0, Math.min(100, rhPct));
  const tempF = airTempC * 1.8 + 32;

  if (tempF < 80) {
    const steadmanF = 0.5 * (tempF + 61.0 + (tempF - 68.0) * 1.2 + rh * 0.094);
    const avgF = (steadmanF + tempF) * 0.5;
    return Number((((avgF - 32) * 5) / 9).toFixed(1));
  }

  let hiF =
    -42.379 +
    2.04901523 * tempF +
    10.14333127 * rh -
    0.22475541 * tempF * rh -
    0.00683783 * tempF * tempF -
    0.05481717 * rh * rh +
    0.00122874 * tempF * tempF * rh +
    0.00085282 * tempF * rh * rh -
    0.00000199 * tempF * tempF * rh * rh;

  if (rh < 13 && tempF >= 80 && tempF <= 112) {
    hiF -= ((13 - rh) / 4) * Math.sqrt((17 - Math.abs(tempF - 95)) / 17);
  } else if (rh > 85 && tempF >= 80 && tempF <= 87) {
    hiF += ((rh - 85) / 10) * ((87 - tempF) / 5);
  }

  return Number((((hiF - 32) * 5) / 9).toFixed(1));
}

/**
 * Estimate radiant black-globe temperature from ambient temp, shortwave solar irradiance,
 * wind cooling factor, and crew exposure type.
 */
export function computeGlobeTempEstimatedC(
  airTempC: number,
  solarRadiationWm2: number,
  windSpeedKmh: number,
  exposure: ExposureType = 'sun'
): number {
  const irradiance = Math.max(0, Math.min(1200, solarRadiationWm2));
  const windMs = Math.max(0.4, windSpeedKmh / 3.6);

  if (exposure === 'indoor') {
    return Number((airTempC + 0.5).toFixed(1));
  }

  const exposureSolarFactor = exposure === 'sun' ? 1.0 : 0.25;
  // Radiant delta scales with solar load and attenuates with convective airflow (wind^0.45)
  const radiantBoost = (irradiance / 115) * exposureSolarFactor * Math.pow(1.5 / windMs, 0.35);
  const clampedBoost = Math.max(0, Math.min(12.5, radiantBoost));

  return Number((airTempC + clampedBoost).toFixed(1));
}

export function classifyEstimatedRisk(wbgtEstimatedC: number, heatIndexEstimatedC: number): EstimatedRiskLevel {
  if (wbgtEstimatedC >= 32.0 || heatIndexEstimatedC >= 49.0) return 'Critical';
  if (wbgtEstimatedC >= 29.5 || heatIndexEstimatedC >= 41.0) return 'High';
  if (wbgtEstimatedC >= 26.5 || heatIndexEstimatedC >= 35.0) return 'Moderate';
  return 'Low';
}

/**
 * Computes estimated WBGT & Heat Index for environmental planning.
 * All outputs are explicitly labeled estimated (`isEstimated: true`).
 */
export function estimateEnvironmentalHeatMetrics(input: ThermalEstimateInput): ThermalEstimateOutput {
  const exposure: ExposureType = input.exposure ?? 'sun';
  const airTempC = Number.isFinite(input.airTempC) ? input.airTempC : 36;
  const rhPct = Number.isFinite(input.relativeHumidityPct)
    ? Math.max(5, Math.min(100, input.relativeHumidityPct))
    : 50;
  const windSpeedKmh = Number.isFinite(input.windSpeedKmh)
    ? Math.max(0, input.windSpeedKmh)
    : 10;
  const solarRadiationWm2 = Number.isFinite(input.solarRadiationWm2)
    ? Math.max(0, input.solarRadiationWm2)
    : 600;

  const wetBulbEstimatedC = computeStullWetBulbC(airTempC, rhPct);
  const globeTempEstimatedC = computeGlobeTempEstimatedC(
    airTempC,
    solarRadiationWm2,
    windSpeedKmh,
    exposure
  );

  // Standard WBGT weighting: 0.7 Tw + 0.2 Tg + 0.1 Ta (with solar load),
  // 0.7 Tw + 0.3 Tg (indoor / zero direct sun)
  const rawWbgt =
    exposure === 'indoor'
      ? 0.7 * wetBulbEstimatedC + 0.3 * globeTempEstimatedC
      : 0.7 * wetBulbEstimatedC + 0.2 * globeTempEstimatedC + 0.1 * airTempC;

  const wbgtEstimatedC = Number(rawWbgt.toFixed(1));
  const heatIndexEstimatedC = computeHeatIndexEstimatedC(airTempC, rhPct);
  const riskLevel = classifyEstimatedRisk(wbgtEstimatedC, heatIndexEstimatedC);

  return {
    wetBulbEstimatedC,
    globeTempEstimatedC,
    wbgtEstimatedC,
    heatIndexEstimatedC,
    riskLevel,
    isEstimated: true,
  };
}

/**
 * Re-computes estimated WBGT for a crew's specific exposure ('sun' vs 'shade' vs 'indoor')
 * from baseline hourly environmental conditions.
 */
export function estimateExposureAdjustedWbgt(hourMetric: HourlyEnvMetric, exposure: ExposureType): ThermalEstimateOutput {
  if (exposure === 'indoor') {
    // Indoor/ventilated bay moderates ambient solar gain and peak radiant load
    const indoorAir = Math.min(hourMetric.airTempC, Math.max(24, hourMetric.airTempC - 4.5));
    return estimateEnvironmentalHeatMetrics({
      airTempC: indoorAir,
      relativeHumidityPct: hourMetric.relativeHumidityPct,
      windSpeedKmh: Math.max(8, hourMetric.windSpeedKmh),
      solarRadiationWm2: 0,
      exposure: 'indoor',
    });
  }

  return estimateEnvironmentalHeatMetrics({
    airTempC: hourMetric.airTempC,
    relativeHumidityPct: hourMetric.relativeHumidityPct,
    windSpeedKmh: hourMetric.windSpeedKmh,
    solarRadiationWm2: hourMetric.solarRadiationWm2,
    exposure,
  });
}
