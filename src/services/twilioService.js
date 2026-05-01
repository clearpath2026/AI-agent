import twilio from 'twilio';
import { config } from '../config/index.js';

// Lazily initialize the Twilio client so startup doesn't fail on missing creds
let _client = null;

function getClient() {
  if (!_client) {
    _client = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);
  }
  return _client;
}

/**
 * Send an SMS via Twilio.
 *
 * @param {string} to    Destination phone number in E.164 format (e.g. +15551234567)
 * @param {string} body  SMS message body (max 1600 chars)
 * @returns {object}     Twilio message object (includes .sid for logging)
 */
export async function sendSms(to, body) {
  const msg = await getClient().messages.create({
    body,
    from: config.TWILIO_PHONE_NUMBER,
    to,
  });

  console.log(`[twilio] SMS → ${to}  SID: ${msg.sid}  Status: ${msg.status}`);
  return msg;
}
