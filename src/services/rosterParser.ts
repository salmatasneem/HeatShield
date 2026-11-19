import { ExposureType, WorkloadIntensity } from '../config/complianceConfig';
import { AcclimatizationStatusTag, CrewRosterRow } from '../types/occupational';

export const ALLOWED_ROSTER_FIELDS = [
  'crew_id',
  'taskType',
  'workload',
  'exposure',
  'shiftStart',
  'shiftEnd',
  'crewTag',
] as const;

export const DEMO_ROSTER_ROWS: CrewRosterRow[] = [
  {
    crew_id: 'Crew-A',
    taskType: 'Structural Steel & Rebar Fixing',
    workload: 'heavy',
    exposure: 'sun',
    shiftStart: '06:00',
    shiftEnd: '17:00',
    crewTag: 'acclimatized',
  },
  {
    crew_id: 'Crew-B',
    taskType: 'Slab Formwork & Shuttering',
    workload: 'moderate',
    exposure: 'sun',
    shiftStart: '07:00',
    shiftEnd: '18:00',
    crewTag: 'returning_after_leave',
  },
  {
    crew_id: 'Crew-C',
    taskType: 'Shaded Pre-Cast Staging & Rigging',
    workload: 'moderate',
    exposure: 'shade',
    shiftStart: '07:00',
    shiftEnd: '17:00',
    crewTag: 'new_to_site',
  },
  {
    crew_id: 'Crew-D',
    taskType: 'MEP Duct & Indoor Conduit Fit-Out',
    workload: 'light',
    exposure: 'indoor',
    shiftStart: '08:00',
    shiftEnd: '18:00',
    crewTag: 'acclimatized',
  },
];

export const SAMPLE_ROSTER_CSV = [
  'crew_id,taskType,workload,exposure,shiftStart,shiftEnd,crewTag',
  ...DEMO_ROSTER_ROWS.map(
    (r) => `${r.crew_id},${r.taskType},${r.workload},${r.exposure},${r.shiftStart},${r.shiftEnd},${r.crewTag || 'acclimatized'}`
  ),
].join('\n');

export interface RosterParseResult {
  rows: CrewRosterRow[];
  strippedPersonalColumns: string[];
  warnings: string[];
}

function normalizeHeaderName(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function mapHeaderToAllowedField(rawHeader: string): (typeof ALLOWED_ROSTER_FIELDS)[number] | null {
  const norm = normalizeHeaderName(rawHeader);
  if (norm === 'crewid' || norm === 'crew' || norm === 'teamid') return 'crew_id';
  if (norm === 'tasktype' || norm === 'task' || norm === 'activity') return 'taskType';
  if (norm === 'workload' || norm === 'workloadlevel' || norm === 'intensity') return 'workload';
  if (norm === 'exposure' || norm === 'sunexposure' || norm === 'zone') return 'exposure';
  if (norm === 'shiftstart' || norm === 'start' || norm === 'starttime') return 'shiftStart';
  if (norm === 'shiftend' || norm === 'end' || norm === 'endtime') return 'shiftEnd';
  if (norm === 'crewtag' || norm === 'acclimatization' || norm === 'acclimatizationtag' || norm === 'tag') {
    return 'crewTag';
  }
  return null;
}

function normalizeWorkload(raw: string): WorkloadIntensity {
  const v = (raw || '').trim().toLowerCase();
  if (v === 'heavy' || v === 'very heavy' || v === 'high') return 'heavy';
  if (v === 'light' || v === 'low') return 'light';
  return 'moderate';
}

function normalizeExposure(raw: string): ExposureType {
  const v = (raw || '').trim().toLowerCase();
  if (v === 'indoor' || v === 'inside' || v === 'ac') return 'indoor';
  if (v === 'shade' || v === 'shaded' || v === 'canopy') return 'shade';
  return 'sun';
}

function normalizeCrewTag(raw: string): AcclimatizationStatusTag {
  const v = (raw || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (v.includes('new')) return 'new_to_site';
  if (v.includes('return') || v.includes('leave')) return 'returning_after_leave';
  return 'acclimatized';
}

function normalizeTime(raw: string, fallback: string): string {
  const trimmed = (raw || '').trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  const h = Math.max(0, Math.min(23, parseInt(match[1], 10)));
  const m = Math.max(0, Math.min(59, parseInt(match[2], 10)));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Parses CSV/pasted roster text strictly into anonymized crew-level rows.
 * Any extra or personal columns (worker names, ages, medical fields, IDs) are dropped immediately.
 */
export function parseRosterCsv(csvText: string): RosterParseResult {
  const lines = String(csvText || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return {
      rows: [],
      strippedPersonalColumns: [],
      warnings: ['No roster rows found in input.'],
    };
  }

  const firstCells = splitCsvLine(lines[0]);
  const mappedHeaders = firstCells.map(mapHeaderToAllowedField);
  const hasHeaderRow = mappedHeaders.some((m) => m !== null);

  const strippedPersonalColumns: string[] = [];
  const colIndices: Partial<Record<(typeof ALLOWED_ROSTER_FIELDS)[number], number>> = {};

  if (hasHeaderRow) {
    firstCells.forEach((rawCol, idx) => {
      const mapped = mapHeaderToAllowedField(rawCol);
      if (mapped) {
        colIndices[mapped] = idx;
      } else if (rawCol.trim()) {
        strippedPersonalColumns.push(rawCol.trim());
      }
    });
  } else {
    // Assume positional order: crew_id, taskType, workload, exposure, shiftStart, shiftEnd[, crewTag]
    colIndices.crew_id = 0;
    colIndices.taskType = 1;
    colIndices.workload = 2;
    colIndices.exposure = 3;
    colIndices.shiftStart = 4;
    colIndices.shiftEnd = 5;
    if (firstCells.length > 6) colIndices.crewTag = 6;
  }

  const dataLines = hasHeaderRow ? lines.slice(1) : lines;
  const rows: CrewRosterRow[] = [];
  const warnings: string[] = [];

  dataLines.forEach((line, idx) => {
    const cells = splitCsvLine(line);
    const rawCrewId = cells[colIndices.crew_id ?? 0] || `Crew-${idx + 1}`;
    // Sanitize crew_id so it remains a short anonymous crew code
    const crew_id = rawCrewId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 24) || `Crew-${idx + 1}`;
    const taskType = (cells[colIndices.taskType ?? 1] || 'General Site Operations').slice(0, 64);
    const workload = normalizeWorkload(cells[colIndices.workload ?? 2] || 'moderate');
    const exposure = normalizeExposure(cells[colIndices.exposure ?? 3] || 'sun');
    const shiftStart = normalizeTime(cells[colIndices.shiftStart ?? 4] || '06:00', '06:00');
    const shiftEnd = normalizeTime(cells[colIndices.shiftEnd ?? 5] || '17:00', '17:00');

    const row: CrewRosterRow = {
      crew_id,
      taskType,
      workload,
      exposure,
      shiftStart,
      shiftEnd,
    };

    if (colIndices.crewTag !== undefined && cells[colIndices.crewTag]) {
      row.crewTag = normalizeCrewTag(cells[colIndices.crewTag]);
    }

    rows.push(row);
  });

  if (strippedPersonalColumns.length > 0) {
    warnings.push(
      `Data minimization applied: dropped non-schema columns (${strippedPersonalColumns.join(', ')}). Only crew-level scheduling fields are retained.`
    );
  }

  return {
    rows,
    strippedPersonalColumns,
    warnings,
  };
}

export function serializeRosterToCsv(rows: CrewRosterRow[]): string {
  const header = ALLOWED_ROSTER_FIELDS.join(',');
  const body = rows.map(
    (r) =>
      `${r.crew_id},"${r.taskType.replace(/"/g, '""')}",${r.workload},${r.exposure},${r.shiftStart},${r.shiftEnd},${r.crewTag || 'acclimatized'}`
  );
  return [header, ...body].join('\n');
}
