import { env } from '../config/env.js';

export function requireAdminPassword(req, res, next) {
  if (!env.ADMIN_PASSWORD) {
    return res.status(503).json({ error: 'Admin UI is not configured. Set ADMIN_PASSWORD in environment.' });
  }

  const provided = req.headers['x-admin-password'];
  if (!provided || provided !== env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}
