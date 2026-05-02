/**
 * Supabase database service.
 *
 * ⚠️  SECURITY: Uses the service role key, which bypasses Row Level Security.
 *     This key must NEVER be sent to a browser, mobile app, or logged anywhere.
 *     Only use this module in server-side Node.js code.
 *
 * Production upgrade path:
 *   - Replace JSONL storage (done ✓)
 *   - Add Row Level Security (RLS) policies in Supabase dashboard
 *   - For PHI tables (refill_requests): enable encrypted columns or use a
 *     HIPAA-covered Postgres instance with a signed BAA
 */

import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

let _client = null;

function db() {
  if (!_client) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error(
        'Supabase is not configured. ' +
        'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.'
      );
    }

    _client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        // Disable browser-style token management — this is a server client
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }
  return _client;
}

// ── Generic helper ────────────────────────────────────────────────────────────

async function insertOne(table, data) {
  const { data: result, error } = await db()
    .from(table)
    .insert(data)
    .select()
    .single();

  if (error) {
    const err = new Error(`[supabase] Insert failed on "${table}": ${error.message}`);
    err.details = error;
    err.status = 500;
    throw err;
  }

  return result;
}

// ── Table-specific inserts ────────────────────────────────────────────────────

export async function insertAppointment(record) {
  return insertOne('appointments', record);
}

/**
 * Insert a refill request.
 * status is ALWAYS forced to 'needs_staff_review' regardless of input.
 * This enforces the healthcare guardrail at the database layer.
 */
export async function insertRefillRequest(record) {
  return insertOne('refill_requests', {
    ...record,
    status: 'needs_staff_review', // ← hardcoded — never change this
  });
}

export async function insertSalesLead(record) {
  return insertOne('sales_leads', {
    status: 'new',
    ...record,
  });
}

export async function insertSupportTicket(record) {
  return insertOne('support_tickets', {
    status: 'open',
    ...record,
  });
}

export async function insertCallLog(record) {
  return insertOne('call_logs', record);
}

export async function insertAuditLog(record) {
  // Audit logs never throw — a failed audit write must not break the main request
  try {
    return await insertOne('audit_logs', record);
  } catch (err) {
    console.error('[supabase] Audit log insert failed:', err.message);
    return null;
  }
}

// ── Update helpers ────────────────────────────────────────────────────────────

export async function updateAppointmentByCalendlyUuid(calendlyEventUuid, updates) {
  const { data, error } = await db()
    .from('appointments')
    .update(updates)
    .eq('calendly_event_uuid', calendlyEventUuid)
    .select()
    .single();

  if (error) {
    throw new Error(`[supabase] Update failed: ${error.message}`);
  }
  return data;
}

// ── Read helpers (useful for admin/staff dashboards later) ────────────────────

export async function getRefillRequestsByStatus(status = 'needs_staff_review') {
  const { data, error } = await db()
    .from('refill_requests')
    .select('*')
    .eq('status', status)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`[supabase] Query failed: ${error.message}`);
  return data;
}

// ── App config (key-value store for runtime settings) ─────────────────────────

export async function getConfig(key) {
  const { data, error } = await db()
    .from('app_config')
    .select('value, updated_at')
    .eq('key', key)
    .maybeSingle();

  if (error) throw new Error(`[supabase] getConfig failed for "${key}": ${error.message}`);
  return data; // { value, updated_at } or null if no override
}

export async function setConfig(key, value) {
  const { data, error } = await db()
    .from('app_config')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    .select()
    .single();

  if (error) throw new Error(`[supabase] setConfig failed for "${key}": ${error.message}`);
  return data;
}

export async function deleteConfig(key) {
  const { error } = await db()
    .from('app_config')
    .delete()
    .eq('key', key);

  if (error) throw new Error(`[supabase] deleteConfig failed for "${key}": ${error.message}`);
}
