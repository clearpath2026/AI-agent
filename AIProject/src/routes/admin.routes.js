import { Router } from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { requireAdminPassword } from '../middleware/adminAuth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getConfig, setConfig, deleteConfig } from '../services/supabaseService.js';
import { listAssistants } from '../services/vapiService.js';
import { PROMPT_DEFAULTS } from '../services/llmService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = Router();

// ── Serve admin UI (no auth — page handles password in JS) ────────────────────
router.get('/', (_req, res) => {
  res.sendFile(join(__dirname, '../admin/index.html'));
});

// ── All API routes below require admin password ───────────────────────────────
router.use(requireAdminPassword);

// GET /admin/prompts — all prompts with current values + override status
router.get('/prompts', asyncHandler(async (_req, res) => {
  const keys = Object.keys(PROMPT_DEFAULTS);
  const rows = await Promise.all(keys.map((key) => getConfig(key)));

  const prompts = keys.map((key, i) => ({
    key,
    defaultValue: PROMPT_DEFAULTS[key],
    value: rows[i]?.value ?? PROMPT_DEFAULTS[key],
    isOverridden: rows[i] !== null,
    updatedAt: rows[i]?.updated_at ?? null,
  }));

  res.json({ prompts });
}));

// PUT /admin/prompts/:key — save an override
router.put('/prompts/:key', asyncHandler(async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;

  if (!(key in PROMPT_DEFAULTS)) {
    return res.status(400).json({ error: `Unknown prompt key: ${key}` });
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return res.status(400).json({ error: 'value must be a non-empty string' });
  }

  const row = await setConfig(key, value.trim());
  res.json({ key, value: row.value, updatedAt: row.updated_at });
}));

// DELETE /admin/prompts/:key — reset to code default
router.delete('/prompts/:key', asyncHandler(async (req, res) => {
  const { key } = req.params;

  if (!(key in PROMPT_DEFAULTS)) {
    return res.status(400).json({ error: `Unknown prompt key: ${key}` });
  }

  await deleteConfig(key);
  res.json({ key, reset: true, defaultValue: PROMPT_DEFAULTS[key] });
}));

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
  res.json({ vapi_active_assistant_id: row?.value ?? null });
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

export default router;
