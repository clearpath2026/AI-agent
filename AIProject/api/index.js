import 'dotenv/config';

// Use dynamic import so module-level errors are caught by the try/catch.
// A static `import { createApp }` would throw before any of our code runs,
// resulting in an opaque FUNCTION_INVOCATION_FAILED with no log output.
let app;

try {
  const { createApp } = await import('../src/app.js');
  app = createApp();
} catch (err) {
  console.error('[startup] Fatal error during app initialization:', err);
  // Surface the real error message so it's visible in the response body
  // (remove the `message` field once the root cause is fixed)
  app = (_req, res) =>
    res.status(500).json({
      error: 'App failed to initialize',
      message: err.message,
      stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    });
}

export default app;
