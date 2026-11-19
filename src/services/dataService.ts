import {
  ComplianceConfig,
  DEFAULT_COMPLIANCE_CONFIG,
} from '../config/complianceConfig';
import {
  CrewRosterRow,
  EnvWeatherState,
  HourlyEnvMetric,
  SitePreset,
} from '../types/occupational';
import { estimateEnvironmentalHeatMetrics } from './wbgtCalculator';
import { DEMO_ROSTER_ROWS } from './rosterParser';
import { AppLocale } from '../utils/i18n';

export const UAE_SITE_PRESETS: SitePreset[] = [
  {
    id: 'dubai',
    name: 'Dubai — Al Quoz / Jebel Ali Site',
    nameAr: 'دبي — منطقة القوز / جبل علي',
    emirate: 'Dubai',
    latitude: 25.1342,
    longitude: 55.2286,
  },
  {
    id: 'abu-dhabi',
    name: 'Abu Dhabi — Mussafah Industrial',
    nameAr: 'أبوظبي — مصفح الصناعية',
    emirate: 'Abu Dhabi',
    latitude: 24.3712,
    longitude: 54.5138,
  },
  {
    id: 'sharjah',
    name: 'Sharjah — Industrial Area 10',
    nameAr: 'الشارقة — المنطقة الصناعية 10',
    emirate: 'Sharjah',
    latitude: 25.3025,
    longitude: 55.4321,
  },
  {
    id: 'al-ain',
    name: 'Al Ain — Al Hili Sector',
    nameAr: 'العين — قطاع الهيلي',
    emirate: 'Al Ain',
    latitude: 24.2874,
    longitude: 55.7745,
  },
];

const SITE_SETTINGS_STORAGE_KEY = 'heatshield_site_settings_v2';
const WEATHER_CACHE_STORAGE_KEY = 'heatshield_site_weather_cache_v2';

export interface StoredSiteSettings {
  selectedSiteId: string;
  customLat: number;
  customLon: number;
  customName: string;
  locale: AppLocale;
  forceMiddaySeason: boolean;
  roster: CrewRosterRow[];
  complianceConfig: ComplianceConfig;
}

function mergeComplianceConfig(rawConfig: any): ComplianceConfig {
  if (!rawConfig || typeof rawConfig !== 'object') {
    return DEFAULT_COMPLIANCE_CONFIG;
  }
  return {
    ...DEFAULT_COMPLIANCE_CONFIG,
    ...rawConfig,
    middayBreak: {
      ...DEFAULT_COMPLIANCE_CONFIG.middayBreak,
      ...(rawConfig.middayBreak || {}),
    },
    provisions: {
      ...DEFAULT_COMPLIANCE_CONFIG.provisions,
      ...(rawConfig.provisions || {}),
    },
    escalationTriggers: {
      ...DEFAULT_COMPLIANCE_CONFIG.escalationTriggers,
      ...(rawConfig.escalationTriggers || {}),
    },
    workZoneModifiers: {
      ...DEFAULT_COMPLIANCE_CONFIG.workZoneModifiers,
      ...(rawConfig.workZoneModifiers || {}),
    },
    ppeModifiers: {
      ...DEFAULT_COMPLIANCE_CONFIG.ppeModifiers,
      ...(rawConfig.ppeModifiers || {}),
    },
    acclimatization: {
      ...DEFAULT_COMPLIANCE_CONFIG.acclimatization,
      ...(rawConfig.acclimatization || {}),
    },
    hydrationCadence: {
      ...DEFAULT_COMPLIANCE_CONFIG.hydrationCadence,
      ...(rawConfig.hydrationCadence || {}),
    },
    conservativeOfflineDefaults: {
      ...DEFAULT_COMPLIANCE_CONFIG.conservativeOfflineDefaults,
      ...(rawConfig.conservativeOfflineDefaults || {}),
    },
    workloadBands: {
      ...DEFAULT_COMPLIANCE_CONFIG.workloadBands,
      ...(rawConfig.workloadBands || {}),
    },
  };
}

export function loadSiteSettings(): StoredSiteSettings {
  const defaults: StoredSiteSettings = {
    selectedSiteId: 'dubai',
    customLat: 25.2048,
    customLon: 55.2708,
    customName: 'Custom UAE Worksite',
    locale: 'en',
    forceMiddaySeason: true,
    roster: DEMO_ROSTER_ROWS,
    complianceConfig: DEFAULT_COMPLIANCE_CONFIG,
  };

  if (typeof window === 'undefined' || !window.localStorage) {
    return defaults;
  }

  try {
    const raw = window.localStorage.getItem(SITE_SETTINGS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      selectedSiteId: typeof parsed.selectedSiteId === 'string' ? parsed.selectedSiteId : defaults.selectedSiteId,
      customLat: typeof parsed.customLat === 'number' ? parsed.customLat : defaults.customLat,
      customLon: typeof parsed.customLon === 'number' ? parsed.customLon : defaults.customLon,
      customName: typeof parsed.customName === 'string' ? parsed.customName : defaults.customName,
      locale: parsed.locale === 'ar' ? 'ar' : 'en',
      forceMiddaySeason: typeof parsed.forceMiddaySeason === 'boolean' ? parsed.forceMiddaySeason : defaults.forceMiddaySeason,
      roster: Array.isArray(parsed.roster) && parsed.roster.length > 0 ? parsed.roster : defaults.roster,
      complianceConfig: parsed.complianceConfig?.middayBreak
        ? mergeComplianceConfig(parsed.complianceConfig)
        : defaults.complianceConfig,
    };
  } catch {
    return defaults;
  }
}

export function saveSiteSettings(settings: StoredSiteSettings): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    // Store ONLY site-level operational settings; zero personal/worker data ever stored.
    window.localStorage.setItem(SITE_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore quota errors
  }
}

function saveWeatherCache(siteId: string, state: EnvWeatherState): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const existingRaw = window.localStorage.getItem(WEATHER_CACHE_STORAGE_KEY);
    const cacheMap = existingRaw ? JSON.parse(existingRaw) : {};
    cacheMap[siteId] = state;
    window.localStorage.setItem(WEATHER_CACHE_STORAGE_KEY, JSON.stringify(cacheMap));
  } catch {
    // Ignore quota errors
  }
}

function loadWeatherCache(siteId: string): EnvWeatherState | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(WEATHER_CACHE_STORAGE_KEY);
    if (!raw) return null;
    const cacheMap = JSON.parse(raw);
    return cacheMap?.[siteId] || null;
  } catch {
    return null;
  }
}

function formatDubaiTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Dubai',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }) + ' GST';
  } catch {
    return iso;
  }
}

function buildBaselineOfflineWeather(site: SitePreset): EnvWeatherState {
  const nowIso = new Date().toISOString();
  // Realistic UAE baseline profile ONLY used when live API fails AND no cached reading exists yet
  const hourly: HourlyEnvMetric[] = [];
  for (let h = 0; h < 24; h++) {
    const tempCurve = 31 + 11 * Math.sin(((h - 6) / 14) * Math.PI);
    const airTempC = Number(Math.max(29, Math.min(44.5, tempCurve)).toFixed(1));
    const rhPct = Math.round(Math.max(28, Math.min(68, 66 - (airTempC - 30) * 2.2)));
    const solarRadiationWm2 =
      h >= 6 && h <= 18 ? Math.round(920 * Math.sin(((h - 6) / 12) * Math.PI)) : 0;
    const uvIndex = Number(((solarRadiationWm2 / 950) * 11).toFixed(1));
    const windSpeedKmh = h >= 11 && h <= 17 ? 16 : 10;

    const est = estimateEnvironmentalHeatMetrics({
      airTempC,
      relativeHumidityPct: rhPct,
      windSpeedKmh,
      solarRadiationWm2,
      exposure: 'sun',
    });

    hourly.push({
      timeIso: `${nowIso.slice(0, 10)}T${String(h).padStart(2, '0')}:00`,
      hourIndex: h,
      hourLabel: `${String(h).padStart(2, '0')}:00`,
      airTempC,
      relativeHumidityPct: rhPct,
      windSpeedKmh,
      solarRadiationWm2,
      uvIndex,
      ...est,
    });
  }

  const currentHour = Math.max(0, Math.min(23, new Date().getHours()));
  return {
    site,
    status: 'offline',
    fetchedAtIso: nowIso,
    lastUpdatedDisplay: 'No live cache',
    sourceLabel: 'Offline Reference Model (Data Stale)',
    current: hourly[currentHour] || hourly[13],
    hourly,
    errorMessage: 'Open-Meteo unreachable and no prior cached response exists.',
  };
}

function normalizeOpenMeteoPayload(raw: any, site: SitePreset): EnvWeatherState | null {
  if (!raw?.hourly?.time || !Array.isArray(raw.hourly.time) || raw.hourly.time.length === 0) {
    return null;
  }

  const times: string[] = raw.hourly.time;
  const temps: number[] = raw.hourly.temperature_2m || [];
  const rhs: number[] = raw.hourly.relative_humidity_2m || [];
  const winds: number[] = raw.hourly.wind_speed_10m || [];
  const rads: number[] = raw.hourly.shortwave_radiation || raw.hourly.direct_normal_irradiance || [];
  const uvs: number[] = raw.hourly.uv_index || [];

  const hourly: HourlyEnvMetric[] = [];
  for (let i = 0; i < Math.min(24, times.length); i++) {
    const timeIso = String(times[i]);
    const hourMatch = timeIso.match(/T(\d{2}):/);
    const hourIndex = hourMatch ? parseInt(hourMatch[1], 10) : i;
    const airTempC = Number((temps[i] ?? 36).toFixed(1));
    const relativeHumidityPct = Math.round(rhs[i] ?? 48);
    const windSpeedKmh = Number((winds[i] ?? 12).toFixed(1));
    const solarRadiationWm2 = Math.round(rads[i] ?? (hourIndex >= 6 && hourIndex <= 18 ? 650 : 0));
    const uvIndex = Number((uvs[i] ?? (solarRadiationWm2 / 100)).toFixed(1));

    const est = estimateEnvironmentalHeatMetrics({
      airTempC,
      relativeHumidityPct,
      windSpeedKmh,
      solarRadiationWm2,
      exposure: 'sun',
    });

    hourly.push({
      timeIso,
      hourIndex,
      hourLabel: `${String(hourIndex).padStart(2, '0')}:00`,
      airTempC,
      relativeHumidityPct,
      windSpeedKmh,
      solarRadiationWm2,
      uvIndex,
      ...est,
    });
  }

  let currentMetric: HourlyEnvMetric;
  if (raw.current && typeof raw.current.temperature_2m === 'number') {
    const airTempC = Number(raw.current.temperature_2m.toFixed(1));
    const relativeHumidityPct = Math.round(raw.current.relative_humidity_2m ?? 48);
    const windSpeedKmh = Number((raw.current.wind_speed_10m ?? 12).toFixed(1));
    const solarRadiationWm2 = Math.round(raw.current.shortwave_radiation ?? hourly[12]?.solarRadiationWm2 ?? 500);
    const uvIndex = Number((raw.current.uv_index ?? solarRadiationWm2 / 100).toFixed(1));
    const est = estimateEnvironmentalHeatMetrics({
      airTempC,
      relativeHumidityPct,
      windSpeedKmh,
      solarRadiationWm2,
      exposure: 'sun',
    });

    const currHour = new Date().getHours();
    currentMetric = {
      timeIso: raw.current.time || new Date().toISOString(),
      hourIndex: currHour,
      hourLabel: `${String(currHour).padStart(2, '0')}:00`,
      airTempC,
      relativeHumidityPct,
      windSpeedKmh,
      solarRadiationWm2,
      uvIndex,
      ...est,
    };
  } else {
    const nowHour = Math.max(0, Math.min(23, new Date().getHours()));
    currentMetric = hourly.find((h) => h.hourIndex === nowHour) || hourly[12] || hourly[0];
  }

  const fetchedAtIso = new Date().toISOString();
  return {
    site,
    status: 'live',
    measurementMode: 'regional_forecast',
    siteMeterOverride: null,
    fetchedAtIso,
    lastUpdatedDisplay: formatDubaiTimestamp(fetchedAtIso),
    sourceLabel: 'Regional forecast (Open-Meteo)',
    current: currentMetric,
    hourly,
  };
}

/**
 * Applies a coordinator-entered on-site calibrated meter reading (Temp / Humidity / optional WBGT)
 * over the regional API forecast, marking the active site condition badge as "site_measured".
 */
export function applySiteMeterOverride(
  baseWeather: EnvWeatherState,
  reading: {
    airTempC: number;
    relativeHumidityPct: number;
    manualWbgtC?: number | null;
  }
): EnvWeatherState {
  const nowIso = new Date().toISOString();
  const displayTime = formatDubaiTimestamp(nowIso);

  const computedCurrent = estimateEnvironmentalHeatMetrics({
    airTempC: reading.airTempC,
    relativeHumidityPct: reading.relativeHumidityPct,
    windSpeedKmh: baseWeather.current.windSpeedKmh,
    solarRadiationWm2: baseWeather.current.solarRadiationWm2,
    exposure: 'sun',
  });

  const finalWbgt =
    typeof reading.manualWbgtC === 'number' && Number.isFinite(reading.manualWbgtC)
      ? Number(reading.manualWbgtC.toFixed(1))
      : computedCurrent.wbgtEstimatedC;

  const tempDelta = reading.airTempC - baseWeather.current.airTempC;
  const rhDelta = reading.relativeHumidityPct - baseWeather.current.relativeHumidityPct;

  const adjustedHourly = baseWeather.hourly.map((h) => {
    const airTempC = Number((h.airTempC + tempDelta).toFixed(1));
    const relativeHumidityPct = Math.max(15, Math.min(95, Math.round(h.relativeHumidityPct + rhDelta)));
    const est = estimateEnvironmentalHeatMetrics({
      airTempC,
      relativeHumidityPct,
      windSpeedKmh: h.windSpeedKmh,
      solarRadiationWm2: h.solarRadiationWm2,
      exposure: 'sun',
    });
    return {
      ...h,
      airTempC,
      relativeHumidityPct,
      ...est,
    };
  });

  return {
    ...baseWeather,
    status: 'live',
    measurementMode: 'site_measured',
    siteMeterOverride: {
      airTempC: Number(reading.airTempC.toFixed(1)),
      relativeHumidityPct: Math.round(reading.relativeHumidityPct),
      manualWbgtC:
        typeof reading.manualWbgtC === 'number' && Number.isFinite(reading.manualWbgtC)
          ? Number(reading.manualWbgtC.toFixed(1))
          : null,
      recordedAtIso: nowIso,
      recordedAtDisplay: displayTime,
    },
    fetchedAtIso: nowIso,
    lastUpdatedDisplay: displayTime,
    sourceLabel: 'Site-measured meter',
    current: {
      ...baseWeather.current,
      airTempC: Number(reading.airTempC.toFixed(1)),
      relativeHumidityPct: Math.round(reading.relativeHumidityPct),
      ...computedCurrent,
      wbgtEstimatedC: finalWbgt,
    },
    hourly: adjustedHourly,
    errorMessage: undefined,
  };
}

/**
 * Fetches live current + 24h hourly meteorological data from Open-Meteo (free, no key).
 * Falls back gracefully to backend proxy and then cached/offline stale state with explicit timestamp.
 */
export async function fetchSiteWeatherData(
  site: SitePreset,
  options: { simulateOffline?: boolean } = {}
): Promise<EnvWeatherState> {
  if (options.simulateOffline) {
    const cached = loadWeatherCache(site.id);
    if (cached) {
      return {
        ...cached,
        status: 'stale',
        measurementMode: 'regional_forecast',
        sourceLabel: 'Regional forecast (Offline Cache)',
        errorMessage: 'Offline simulation enabled — showing last cached environmental reading.',
      };
    }
    return {
      ...buildBaselineOfflineWeather(site),
      measurementMode: 'regional_forecast',
    };
  }

  const lat = Number(site.latitude).toFixed(4);
  const lon = Number(site.longitude).toFixed(4);

  // 1. Direct Open-Meteo call (free, no API key required)
  const directUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,shortwave_radiation,uv_index&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,shortwave_radiation,uv_index&timezone=Asia%2FDubai&forecast_days=1`;

  try {
    const res = await fetch(directUrl, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const json = await res.json();
      const normalized = normalizeOpenMeteoPayload(json, site);
      if (normalized) {
        saveWeatherCache(site.id, normalized);
        return normalized;
      }
    }
  } catch {
    // Fall through to server proxy
  }

  // 2. Fallback to same-origin backend proxy /api/weather-forecast
  try {
    const proxyRes = await fetch(`/api/weather-forecast?lat=${lat}&lon=${lon}`, {
      signal: AbortSignal.timeout(4500),
    });
    if (proxyRes.ok) {
      const json = await proxyRes.json();
      const normalized = normalizeOpenMeteoPayload(json, site);
      if (normalized) {
        saveWeatherCache(site.id, normalized);
        return normalized;
      }
    }
  } catch {
    // Fall through to stale/offline state
  }

  // 3. Visible Stale / Offline degraded state
  const cached = loadWeatherCache(site.id);
  if (cached) {
    return {
      ...cached,
      status: 'stale',
      measurementMode: 'regional_forecast',
      sourceLabel: 'Regional forecast (Data Stale)',
      errorMessage: 'Open-Meteo API failed or offline. Displaying cached site forecast.',
    };
  }

  return {
    ...buildBaselineOfflineWeather(site),
    measurementMode: 'regional_forecast',
  };
}
