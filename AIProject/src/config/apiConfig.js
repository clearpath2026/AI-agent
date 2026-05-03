import { env } from './env.js';
import { getConfig } from '../services/supabaseService.js';

const _overrides = {};

export const API_KEYS = [
  'OPENAI_API_KEY', 'OPENAI_MODEL',
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER',
  'CALENDLY_API_TOKEN',
  'CALENDLY_URL_NEW_PATIENT', 'CALENDLY_URL_EXISTING_PATIENT',
  'CALENDLY_URL_SALES', 'CALENDLY_URL_SUPPORT',
  'VAPI_API_KEY', 'VAPI_WEBHOOK_SECRET',
];

export function getRuntimeKey(envKey) {
  if (envKey in _overrides) {
    return _overrides[envKey];
  }
  return env[envKey] || null;
}

export function setRuntimeKey(envKey, value) {
  if (value === null || value === undefined) {
    delete _overrides[envKey];
  } else {
    _overrides[envKey] = value;
  }
}

export async function loadRuntimeKeysFromDb() {
  try {
    for (const key of API_KEYS) {
      const dbKey = `api.${key}`;
      const row = await getConfig(dbKey);
      if (row && row.value) {
        setRuntimeKey(key, row.value);
      }
    }
  } catch (err) {
    console.error('[apiConfig] Failed to load runtime keys from database:', err.message);
  }
}
