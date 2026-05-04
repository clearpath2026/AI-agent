/**
 * Express application factory.
 * Separated from server.js so the app can be imported in tests without
 * automatically starting a TCP server.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { loadRuntimeKeysFromDb } from './config/apiConfig.js';

// Routes
import healthRouter from './routes/health.js';
import calendlyRouter from './routes/calendly.routes.js';
import toolsRouter from './routes/tools.routes.js';
import vapiRouter from './routes/vapi.routes.js';
import adminRouter from './routes/admin.routes.js';

export function createApp() {
  const app = express();

  loadRuntimeKeysFromDb().catch((err) => console.error('[apiConfig] DB key load failed:', err.message));

  // ── Security ──────────────────────────────────────────────────────────────
  // helmet sets safe HTTP headers and removes X-Powered-By
  // CSP disabled: this is a backend API — the only HTML served is the
  // password-protected admin UI which uses inline <script>/<style>.
  app.use(helmet({ contentSecurityPolicy: false }));

  // CORS — restrict to known origins in production via CORS_ORIGIN env var
  app.use(cors({
    origin: env.CORS_ORIGIN ? env.CORS_ORIGIN.split(',').map((o) => o.trim()) : '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'x-vapi-secret', 'x-admin-password'],
  }));

  // ── Reliability ───────────────────────────────────────────────────────────
  // Trust the first proxy hop (Render/Railway add X-Forwarded-For headers)
  app.set('trust proxy', 1);

  // ── Logging & Parsing ─────────────────────────────────────────────────────
  app.use(requestLogger);

  // 10 kb body limit prevents large-payload DoS attacks
  app.use(express.json({ limit: '10kb' }));

  // ── Routes ────────────────────────────────────────────────────────────────
  app.use('/health', healthRouter);
  app.use('/calendly', calendlyRouter);
  app.use('/tools', toolsRouter);
  app.use('/vapi', vapiRouter);
  app.use('/admin', adminRouter);

  // ── Fallbacks ─────────────────────────────────────────────────────────────
  app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));
  app.use(errorHandler);

  return app;
}

// Default export for Vercel — @vercel/node validates the default export of every
// module in the import chain and requires it to be a function or http.Server.
export default createApp();
