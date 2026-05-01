/**
 * Wraps an async Express route handler so any thrown error is forwarded
 * to Express's next() — which sends it to the centralized errorHandler.
 *
 * Without this, an unhandled promise rejection inside a route silently hangs.
 *
 * Usage:
 *   router.post('/path', asyncHandler(async (req, res) => {
 *     const data = await someService.doWork(); // can throw safely
 *     res.json(data);
 *   }));
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
