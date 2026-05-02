import 'dotenv/config';
import { createApp } from '../src/app.js';

// Wrap startup in try/catch so any initialization error surfaces in Vercel
// Runtime Logs instead of showing a generic "function crashed" page.
let app;

try {
  app = createApp();
} catch (err) {
  console.error('[startup] Fatal error during app initialization:', err);
  // Return a minimal handler so the error appears in Vercel logs
  app = (_req, res) => res.status(500).json({ error: 'App failed to initialize' });
}

export default app;
