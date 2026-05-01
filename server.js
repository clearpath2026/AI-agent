// Load environment variables before any other module imports config
import 'dotenv/config';

import { createApp } from './src/app.js';
import { env } from './src/config/env.js';

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`[server] Running on port ${env.PORT} (${env.NODE_ENV})`);
  console.log(`[server] Health check → http://localhost:${env.PORT}/health`);
});

export default app;
