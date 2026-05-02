// Backward-compatibility shim.
// Old files that import { config } still work without changes.
// New files should import { env } from './env.js' directly.
export { env as config } from './env.js';
