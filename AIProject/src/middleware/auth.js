import { config } from '../config/index.js';

/**
 * Verifies the shared secret Vapi includes in every tool-call webhook.
 * Configure the same value in Vapi's tool "server.secret" field.
 *
 * Vapi sends:  x-vapi-secret: <your secret>
 *
 * Reject anything that doesn't match — prevents unauthorized callers from
 * triggering appointment bookings, refill intake, etc.
 */
export function requireVapiSecret(req, res, next) {
  const provided = req.headers['x-vapi-secret'];

  if (!provided || provided !== config.VAPI_WEBHOOK_SECRET) {
    console.warn(`[auth] Unauthorized tool-call attempt from ${req.ip}`);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}
