/**
 * Centralized Express error handler.
 * Pass errors here via next(err) from any route or async handler.
 *
 * In production: 500 details are hidden to avoid leaking stack traces
 * to callers (Vapi, Twilio), which could expose internal system info.
 */
export function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;

  console.error(`[error] ${req.method} ${req.path} → ${status}: ${err.message}`);
  if (status === 500) console.error(err.stack);

  const message =
    process.env.NODE_ENV === 'production' && status === 500
      ? 'Internal server error'
      : err.message;

  res.status(status).json({ error: message });
}
