import { insertAuditLog } from '../services/supabaseService.js';

/**
 * Write an entry to the audit_logs table.
 *
 * This function NEVER throws. A failed audit write is logged to the console
 * but must never break the calling request — audit is observational, not transactional.
 *
 * @param {string}      action      What happened, e.g. 'refill_request.created'
 * @param {string}      entityType  Table name, e.g. 'refill_requests'
 * @param {string|null} entityId    UUID of the created/modified record
 * @param {object}      metadata    Extra context (sanitize PHI before including)
 */
export async function logAudit(action, entityType, entityId = null, metadata = {}) {
  await insertAuditLog({
    action,
    entity_type: entityType,
    entity_id: entityId || null,
    metadata,
  });
}
