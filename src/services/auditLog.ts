import { ComplianceStatus } from '../config/complianceConfig';
import { AuditGovernanceEntry } from '../types/occupational';

export type HumanGovernanceDecision = 'Approved' | 'Edited' | 'Rejected / Replaced';

export interface CreateAuditEntryParams {
  idPrefix?: string;
  planId: string;
  aiSuggestionSummary: string;
  complianceVerdict: ComplianceStatus;
  humanDecision: HumanGovernanceDecision;
  details: string;
  timestampIso?: string;
}

const MAX_AUDIT_ENTRIES = 50;

/**
 * Pure audit-log helper tracking AI suggestion -> deterministic compliance verdict -> human decision.
 * Strictly site/crew-level governance metadata only; zero individual worker data.
 */
export function createAuditEntry(params: CreateAuditEntryParams): AuditGovernanceEntry {
  const prefix = params.idPrefix || 'audit';
  return {
    id: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestampIso: params.timestampIso || new Date().toISOString(),
    planId: params.planId,
    aiSuggestionSummary: params.aiSuggestionSummary,
    complianceVerdict: params.complianceVerdict,
    humanDecision: params.humanDecision,
    details: params.details,
  };
}

export function appendAuditEntry(
  history: AuditGovernanceEntry[],
  entry: AuditGovernanceEntry,
  limit: number = MAX_AUDIT_ENTRIES
): AuditGovernanceEntry[] {
  return [entry, ...history].slice(0, limit);
}

export function summarizeAuditDecisions(history: AuditGovernanceEntry[]) {
  return {
    total: history.length,
    approved: history.filter((e) => e.humanDecision === 'Approved').length,
    edited: history.filter((e) => e.humanDecision === 'Edited').length,
    rejected: history.filter((e) => e.humanDecision === 'Rejected / Replaced').length,
  };
}
