import { Router } from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { requireAdminPassword } from '../middleware/adminAuth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getConfig, setConfig, deleteConfig, getLogs, updateRecordStatus } from '../services/supabaseService.js';
import { listAssistants, listPhoneNumbers, createOutboundCall, updatePhoneNumberAssistant } from '../services/vapiService.js';
import { resetProvider as resetLlmProvider } from '../services/llmService.js';
import { getRuntimeKey, setRuntimeKey, API_KEYS } from '../config/apiConfig.js';
import { resetClient as resetTwilioClient } from '../services/twilioService.js';

const API_KEY_META = {
  OPENAI_API_KEY:                { label: 'API Key',              group: 'openai' },
  OPENAI_MODEL:                  { label: 'Model',                group: 'openai' },
  TWILIO_ACCOUNT_SID:            { label: 'Account SID',          group: 'twilio' },
  TWILIO_AUTH_TOKEN:             { label: 'Auth Token',           group: 'twilio' },
  TWILIO_PHONE_NUMBER:           { label: 'Phone Number',         group: 'twilio' },
  CALENDLY_API_TOKEN:            { label: 'API Token',            group: 'calendly' },
  CALENDLY_URL_NEW_PATIENT:      { label: 'New Patient URL',      group: 'calendly' },
  CALENDLY_URL_EXISTING_PATIENT: { label: 'Existing Patient URL', group: 'calendly' },
  CALENDLY_URL_SALES:            { label: 'Sales URL',            group: 'calendly' },
  CALENDLY_URL_SUPPORT:          { label: 'Support URL',          group: 'calendly' },
  VAPI_API_KEY:                  { label: 'API Key',              group: 'vapi' },
  VAPI_WEBHOOK_SECRET:           { label: 'Webhook Secret',       group: 'vapi' },
};

const LOG_TABLE_MAP = {
  'call-logs':       'call_logs',
  'appointments':    'appointments',
  'refill-requests': 'refill_requests',
  'sales-leads':     'sales_leads',
  'support-tickets': 'support_tickets',
};

const STATUS_OPTIONS = {
  call_logs:       null,
  appointments:    ['link_sent', 'booked', 'cancelled', 'no_show'],
  refill_requests: ['needs_staff_review', 'approved', 'denied', 'pending_callback'],
  sales_leads:     ['new', 'contacted', 'qualified', 'closed_won', 'closed_lost'],
  support_tickets: ['open', 'in_progress', 'resolved', 'closed'],
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = Router();

// ── Serve admin UI (no auth — page handles password in JS) ────────────────────
router.get('/', (_req, res) => {
  res.sendFile(join(__dirname, '../admin/index.html'));
});

// ── All API routes below require admin password ───────────────────────────────
router.use(requireAdminPassword);

// GET /admin/vapi/assistants — list from Vapi API
router.get('/vapi/assistants', asyncHandler(async (_req, res) => {
  try {
    const assistants = await listAssistants();
    res.json({ assistants });
  } catch (err) {
    res.status(err.status ?? 502).json({ error: err.message });
  }
}));

// GET /admin/config — current config values
router.get('/config', asyncHandler(async (_req, res) => {
  const row = await getConfig('config.vapi_active_assistant_id');
  res.json({
    vapi_active_assistant_id: row?.value ?? null,
    twilio_phone_number: getRuntimeKey('TWILIO_PHONE_NUMBER'),
  });
}));

// PUT /admin/config — save config values
router.put('/config', asyncHandler(async (req, res) => {
  const { vapi_active_assistant_id } = req.body;

  if (typeof vapi_active_assistant_id !== 'string' || vapi_active_assistant_id.trim() === '') {
    return res.status(400).json({ error: 'vapi_active_assistant_id must be a non-empty string' });
  }

  await setConfig('config.vapi_active_assistant_id', vapi_active_assistant_id);
  res.json({ vapi_active_assistant_id });
}));

// GET /admin/apis — all API key configs (never returns actual values)
router.get('/apis', asyncHandler(async (_req, res) => {
  const rows = await Promise.all(API_KEYS.map((key) => getConfig('api.' + key)));

  const apis = API_KEYS.map((key, i) => {
    const dbRow = rows[i];
    const envVal = process.env[key]; // raw env (not getRuntimeKey) to check source
    let source;
    if (dbRow?.value) source = 'db';
    else if (envVal) source = 'env';
    else source = 'missing';

    return {
      key,
      label: API_KEY_META[key]?.label ?? key,
      group: API_KEY_META[key]?.group ?? 'other',
      source,
      hasValue: !!(dbRow?.value || envVal),
    };
  });

  res.json({ apis });
}));

// PUT /admin/apis/:key — save an API key to DB, update in-memory cache, reset relevant service singleton
router.put('/apis/:key', asyncHandler(async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;

  if (!API_KEYS.includes(key)) {
    return res.status(400).json({ error: `Unknown API key: ${key}` });
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return res.status(400).json({ error: 'value must be a non-empty string' });
  }

  await setConfig('api.' + key, value.trim());
  setRuntimeKey(key, value.trim());

  // Reset service singletons that cache clients at init time
  if (['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'].includes(key)) {
    resetTwilioClient();
  }
  if (['OPENAI_API_KEY', 'OPENAI_MODEL'].includes(key)) {
    resetLlmProvider();
  }

  res.json({ key, source: 'db', hasValue: true });
}));

// DELETE /admin/apis/:key — remove DB override, fall back to env var
router.delete('/apis/:key', asyncHandler(async (req, res) => {
  const { key } = req.params;

  if (!API_KEYS.includes(key)) {
    return res.status(400).json({ error: `Unknown API key: ${key}` });
  }

  await deleteConfig('api.' + key);
  setRuntimeKey(key, null);

  if (['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'].includes(key)) {
    resetTwilioClient();
  }
  if (['OPENAI_API_KEY', 'OPENAI_MODEL'].includes(key)) {
    resetLlmProvider();
  }

  const envVal = process.env[key];
  res.json({ key, source: envVal ? 'env' : 'missing', hasValue: !!envVal });
}));

// GET /admin/apis/health — parallel health checks for all services
router.get('/apis/health', asyncHandler(async (_req, res) => {
  async function checkOpenAI() {
    const key = getRuntimeKey('OPENAI_API_KEY');
    if (!key) return { status: 'missing', message: 'API key not configured' };
    try {
      const r = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!r.ok) return { status: 'error', message: `HTTP ${r.status}` };
      return { status: 'ok' };
    } catch (e) { return { status: 'error', message: e.message }; }
  }

  async function checkTwilio() {
    const sid = getRuntimeKey('TWILIO_ACCOUNT_SID');
    const token = getRuntimeKey('TWILIO_AUTH_TOKEN');
    if (!sid || !token) return { status: 'missing', message: 'Credentials not configured' };
    try {
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
        headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64') },
      });
      if (!r.ok) return { status: 'error', message: `HTTP ${r.status}` };
      return { status: 'ok' };
    } catch (e) { return { status: 'error', message: e.message }; }
  }

  async function checkCalendly() {
    const token = getRuntimeKey('CALENDLY_API_TOKEN');
    if (!token) return { status: 'missing', message: 'API token not configured' };
    try {
      const r = await fetch('https://api.calendly.com/users/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return { status: 'error', message: `HTTP ${r.status}` };
      return { status: 'ok' };
    } catch (e) { return { status: 'error', message: e.message }; }
  }

  async function checkVapi() {
    const key = getRuntimeKey('VAPI_API_KEY');
    if (!key) return { status: 'missing', message: 'API key not configured' };
    try {
      const r = await fetch('https://api.vapi.ai/assistant', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!r.ok) return { status: 'error', message: `HTTP ${r.status}` };
      return { status: 'ok' };
    } catch (e) { return { status: 'error', message: e.message }; }
  }

  const [openai, twilio, calendly, vapi] = await Promise.all([
    checkOpenAI(), checkTwilio(), checkCalendly(), checkVapi(),
  ]);

  res.json({ openai, twilio, calendly, vapi });
}));

// GET /admin/vapi/phone-numbers — list Vapi phone numbers
router.get('/vapi/phone-numbers', asyncHandler(async (_req, res) => {
  try {
    const phoneNumbers = await listPhoneNumbers();
    res.json({ phoneNumbers });
  } catch (err) {
    res.status(err.status ?? 502).json({ error: err.message });
  }
}));

// PATCH /admin/vapi/phone-numbers/:id — assign assistant to a phone number
router.patch('/vapi/phone-numbers/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { assistantId } = req.body;

  try {
    const updated = await updatePhoneNumberAssistant(id, assistantId ?? null);
    res.json({ id, assistantId: updated.assistantId ?? assistantId ?? null });
  } catch (err) {
    res.status(err.status ?? 502).json({ error: err.message });
  }
}));

// GET /admin/outbound/config — current outbound call config
router.get('/outbound/config', asyncHandler(async (_req, res) => {
  const [assistantRow, phoneNumberRow, firstMessageRow] = await Promise.all([
    getConfig('config.outbound_assistant_id'),
    getConfig('config.outbound_phone_number_id'),
    getConfig('config.outbound_first_message'),
  ]);

  res.json({
    assistant_id: assistantRow?.value ?? null,
    phone_number_id: phoneNumberRow?.value ?? null,
    first_message: firstMessageRow?.value ?? null,
  });
}));

// PUT /admin/outbound/config — save outbound call config
router.put('/outbound/config', asyncHandler(async (req, res) => {
  const { assistant_id, phone_number_id, first_message } = req.body;

  const updates = [];
  if (assistant_id != null) updates.push(setConfig('config.outbound_assistant_id', assistant_id));
  if (phone_number_id != null) updates.push(setConfig('config.outbound_phone_number_id', phone_number_id));
  if (first_message != null) updates.push(setConfig('config.outbound_first_message', first_message));

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No config fields provided' });
  }

  await Promise.all(updates);
  res.json({ assistant_id, phone_number_id, first_message });
}));

// POST /admin/outbound/call — trigger an outbound call
router.post('/outbound/call', asyncHandler(async (req, res) => {
  const { to_number } = req.body;

  if (!to_number || typeof to_number !== 'string') {
    return res.status(400).json({ error: 'to_number is required' });
  }

  const [assistantRow, phoneNumberRow, firstMessageRow] = await Promise.all([
    getConfig('config.outbound_assistant_id'),
    getConfig('config.outbound_phone_number_id'),
    getConfig('config.outbound_first_message'),
  ]);

  const assistantId = assistantRow?.value;
  const phoneNumberId = phoneNumberRow?.value;

  if (!assistantId) return res.status(400).json({ error: 'No outbound assistant configured. Set it in the Outbound tab.' });
  if (!phoneNumberId) return res.status(400).json({ error: 'No outbound phone number configured. Set it in the Outbound tab.' });

  const call = await createOutboundCall({
    toNumber: to_number,
    assistantId,
    phoneNumberId,
    firstMessage: firstMessageRow?.value ?? null,
  });

  res.json({ success: true, callId: call.id });
}));

// GET /admin/logs/:table — paginated log query with optional filters
router.get('/logs/:table', asyncHandler(async (req, res) => {
  const { table: tableSlug } = req.params;
  const dbTable = LOG_TABLE_MAP[tableSlug];
  if (!dbTable) {
    return res.status(400).json({ error: `Unknown log table: ${tableSlug}` });
  }

  const limit  = Math.min(parseInt(req.query.limit  ?? '20', 10), 100);
  const offset = Math.max(parseInt(req.query.offset ?? '0',  10), 0);
  const { phone, from, to } = req.query;

  const { rows, total } = await getLogs(dbTable, { limit, offset, phone, from, to });
  res.json({ rows, total, statusOptions: STATUS_OPTIONS[dbTable] ?? null });
}));

// PATCH /admin/logs/:table/:id — update status field
router.patch('/logs/:table/:id', asyncHandler(async (req, res) => {
  const { table: tableSlug, id } = req.params;
  const { status } = req.body;

  const dbTable = LOG_TABLE_MAP[tableSlug];
  if (!dbTable) {
    return res.status(400).json({ error: `Unknown log table: ${tableSlug}` });
  }

  const options = STATUS_OPTIONS[dbTable];
  if (!options) {
    return res.status(400).json({ error: `Table "${tableSlug}" has no status field` });
  }
  if (!status || !options.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${options.join(', ')}` });
  }

  const row = await updateRecordStatus(dbTable, id, status);
  res.json({ id, status: row.status, updatedAt: row.updated_at });
}));

export default router;
