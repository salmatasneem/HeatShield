import {
  RestStationConfig,
  ShadeCheckInRecord,
  ShadeCoolingType,
  SitePreset,
} from '../types/occupational';

const SHADE_REGISTRY_STORAGE_KEY = 'heatshield_shade_registry_v1';

export const REST_STATION_PRESETS: Array<Omit<RestStationConfig, 'siteId' | 'siteName'>> = [
  {
    stationId: 'SHADE-A1',
    stationName: 'Shade Bay A1 · AC Rest Hall',
    coolingType: 'ac_hall',
    capacity: 24,
  },
  {
    stationId: 'SHADE-B2',
    stationName: 'Shade Bay B2 · Misting Tent',
    coolingType: 'misting_tent',
    capacity: 18,
  },
  {
    stationId: 'SHADE-C1',
    stationName: 'Hydration Canopy C1 · West Apron',
    coolingType: 'shaded_canopy',
    capacity: 14,
  },
  {
    stationId: 'SHADE-R1',
    stationName: 'Delivery Rider AC Rest Sanctuary',
    coolingType: 'ac_hall',
    capacity: 16,
  },
];

export function buildRestStationsForSite(site: SitePreset): RestStationConfig[] {
  return REST_STATION_PRESETS.map((preset) => ({
    ...preset,
    siteId: site.id,
    siteName: site.name,
  }));
}

/**
 * Generates a zero-typing worker check-in URL encoded inside the Rest Station QR code.
 * Encodes ONLY station + site + optional anonymous crew code (never personal fields).
 */
export function buildStationCheckInUrl(station: RestStationConfig, origin: string): string {
  const cleanOrigin = origin.replace(/\/+$/, '');
  const params = new URLSearchParams();
  params.set('checkin', '1');
  params.set('station', station.stationId.trim() || 'SHADE-A1');
  params.set('stationName', station.stationName.trim() || 'Shaded Rest Station');
  params.set('site', station.siteId || 'dubai');
  params.set('cooling', station.coolingType || 'shaded_canopy');
  if (station.defaultCrewId && station.defaultCrewId.trim()) {
    params.set('crew', station.defaultCrewId.trim());
  }
  return `${cleanOrigin}/?${params.toString()}`;
}

export interface ParsedCheckInParams {
  isCheckIn: boolean;
  stationId: string;
  stationName: string;
  siteId: string;
  coolingType: ShadeCoolingType;
  crewId?: string;
}

export function parseCheckInQueryParams(search: string): ParsedCheckInParams | null {
  if (!search) return null;
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  if (params.get('checkin') !== '1') return null;

  const rawCooling = params.get('cooling');
  const coolingType: ShadeCoolingType =
    rawCooling === 'ac_hall' || rawCooling === 'misting_tent' || rawCooling === 'shaded_canopy'
      ? rawCooling
      : 'shaded_canopy';

  const stationId = (params.get('station') || 'SHADE-A1').trim().slice(0, 32);
  const stationName = (params.get('stationName') || `Shade Station ${stationId}`).trim().slice(0, 80);
  const siteId = (params.get('site') || 'dubai').trim().slice(0, 32);
  const crewParam = params.get('crew')?.trim().slice(0, 24);

  return {
    isCheckIn: true,
    stationId,
    stationName,
    siteId,
    coolingType,
    crewId: crewParam || undefined,
  };
}

function loadLocalShadeRegistry(): ShadeCheckInRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SHADE_REGISTRY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalShadeRegistry(entries: ShadeCheckInRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SHADE_REGISTRY_STORAGE_KEY, JSON.stringify(entries.slice(0, 200)));
  } catch {
    // ignore storage quota
  }
}

export async function fetchShadeRegistry(): Promise<ShadeCheckInRecord[]> {
  try {
    const res = await fetch('/api/shade-registry', {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.entries)) {
        saveLocalShadeRegistry(data.entries);
        return data.entries;
      }
    }
  } catch {
    // Fallback cleanly to local registry cache
  }
  return loadLocalShadeRegistry();
}

export async function recordShadeCheckIn(payload: {
  stationId: string;
  stationName: string;
  siteId: string;
  crew_id: string;
  coolingType: ShadeCoolingType;
  method: 'qr_scan' | 'quick_tap';
}): Promise<{ entry: ShadeCheckInRecord; entries: ShadeCheckInRecord[] }> {
  const optimisticEntry: ShadeCheckInRecord = {
    id: `shade-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    stationId: payload.stationId,
    stationName: payload.stationName,
    siteId: payload.siteId,
    crew_id: payload.crew_id || 'Site-Crew',
    coolingType: payload.coolingType,
    checkedInAtIso: new Date().toISOString(),
    method: payload.method,
  };

  try {
    const res = await fetch('/api/shade-registry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3500),
    });
    if (res.ok) {
      const data = await res.json();
      const entries = Array.isArray(data.entries) ? data.entries : [data.entry || optimisticEntry];
      saveLocalShadeRegistry(entries);
      return {
        entry: data.entry || optimisticEntry,
        entries,
      };
    }
  } catch {
    // Store offline locally cleanly
  }

  const localEntries = [optimisticEntry, ...loadLocalShadeRegistry()].slice(0, 200);
  saveLocalShadeRegistry(localEntries);
  return {
    entry: optimisticEntry,
    entries: localEntries,
  };
}

export async function clearShadeRegistry(stationId?: string): Promise<ShadeCheckInRecord[]> {
  try {
    const res = await fetch('/api/shade-registry/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stationId ? { stationId } : {}),
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      const entries = Array.isArray(data.entries) ? data.entries : [];
      saveLocalShadeRegistry(entries);
      return entries;
    }
  } catch {
    // Offline fallback
  }
  const remaining = stationId
    ? loadLocalShadeRegistry().filter((e) => e.stationId !== stationId)
    : [];
  saveLocalShadeRegistry(remaining);
  return remaining;
}

export function summarizeRegistryByStation(
  entries: ShadeCheckInRecord[]
): Array<{ stationId: string; stationName: string; count: number; latestIso: string }> {
  const map = new Map<string, { stationId: string; stationName: string; count: number; latestIso: string }>();
  for (const item of entries) {
    const existing = map.get(item.stationId);
    if (!existing) {
      map.set(item.stationId, {
        stationId: item.stationId,
        stationName: item.stationName,
        count: 1,
        latestIso: item.checkedInAtIso,
      });
    } else {
      existing.count += 1;
      if (item.checkedInAtIso > existing.latestIso) {
        existing.latestIso = item.checkedInAtIso;
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}
