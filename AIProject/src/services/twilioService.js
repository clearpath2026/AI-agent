import twilio from 'twilio';
import { getRuntimeKey } from '../config/apiConfig.js';

// Lazily initialize the Twilio client so startup doesn't fail on missing creds
let _client = null;

function getClient() {
  if (!_client) {
    const sid = getRuntimeKey('TWILIO_ACCOUNT_SID');
    const token = getRuntimeKey('TWILIO_AUTH_TOKEN');
    if (!sid || !token) throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required');
    _client = twilio(sid, token);
  }
  return _client;
}

export function resetClient() {
  _client = null;
}

/**
 * Send an SMS via Twilio.
 *
 * @param {string} to    Destination phone number in E.164 format (e.g. +15551234567)
 * @param {string} body  SMS message body (max 1600 chars)
 * @returns {object}     Twilio message object (includes .sid for logging)
 */
export async function sendSms(to, body) {
  const from = getRuntimeKey('TWILIO_PHONE_NUMBER');
  if (!from) throw new Error('TWILIO_PHONE_NUMBER is not configured');
  const msg = await getClient().messages.create({ body, from, to });
  console.log(`[twilio] SMS → ${to}  SID: ${msg.sid}  Status: ${msg.status}`);
  return msg;
}
