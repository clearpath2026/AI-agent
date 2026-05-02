// Central configuration module.
// All other modules import from here — never read process.env directly elsewhere.
// dotenv is loaded in server.js before this module is first imported.

const optional = (key, fallback = '') => process.env[key] || fallback;

export const env = {
  // ── Server ────────────────────────────────────────────────────
  PORT: parseInt(optional('PORT', '3000'), 10),
  NODE_ENV: optional('NODE_ENV', 'development'),
  IS_PROD: optional('NODE_ENV') === 'production',
  CORS_ORIGIN: optional('CORS_ORIGIN'),

  // ── Twilio ────────────────────────────────────────────────────
  TWILIO_ACCOUNT_SID: optional('TWILIO_ACCOUNT_SID'),
  TWILIO_AUTH_TOKEN: optional('TWILIO_AUTH_TOKEN'),
  TWILIO_PHONE_NUMBER: optional('TWILIO_PHONE_NUMBER'),

  // ── Calendly ──────────────────────────────────────────────────
  CALENDLY_API_TOKEN: optional('CALENDLY_API_TOKEN'),
  CALENDLY_API_BASE: 'https://api.calendly.com',
  CALENDLY_URL_NEW_PATIENT: optional('CALENDLY_URL_NEW_PATIENT'),
  CALENDLY_URL_EXISTING_PATIENT: optional('CALENDLY_URL_EXISTING_PATIENT'),
  CALENDLY_URL_SALES: optional('CALENDLY_URL_SALES'),
  CALENDLY_URL_SUPPORT: optional('CALENDLY_URL_SUPPORT'),

  // ── Vapi ──────────────────────────────────────────────────────
  VAPI_WEBHOOK_SECRET: optional('VAPI_WEBHOOK_SECRET'),

  // ── OpenAI / LLM ──────────────────────────────────────────────
  OPENAI_API_KEY: optional('OPENAI_API_KEY'),
  OPENAI_MODEL: optional('OPENAI_MODEL', 'gpt-4o-mini'),
  LLM_PROVIDER: optional('LLM_PROVIDER', 'openai'),

  // ── Supabase ──────────────────────────────────────────────────
  // ⚠️  Service role key bypasses RLS — server-side only, never expose to clients
  SUPABASE_URL: optional('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: optional('SUPABASE_SERVICE_ROLE_KEY'),

  // ── Admin UI ──────────────────────────────────────────────────
  ADMIN_PASSWORD: optional('ADMIN_PASSWORD'),
  VAPI_API_KEY: optional('VAPI_API_KEY'),
};

// Warn at startup for any missing important vars.
// The app still starts so you can debug missing config without it crashing.
const IMPORTANT_VARS = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER',
  'CALENDLY_API_TOKEN',
  'VAPI_WEBHOOK_SECRET',
  'OPENAI_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
];

for (const key of IMPORTANT_VARS) {
  if (!env[key]) {
    console.warn(`[env] WARNING: Missing env var → ${key}`);
  }
}
