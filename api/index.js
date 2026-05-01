// Vercel serverless entry point.
//
// Vercel calls the default export as an HTTP handler on every request.
// Express apps are compatible: the `app` object is itself a function(req, res).
//
// createApp() runs once when the module loads and is reused across
// warm invocations — same behavior as a traditional server, without app.listen().

import 'dotenv/config';
import { createApp } from '../src/app.js';

export default createApp();
