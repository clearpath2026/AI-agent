import { Router } from 'express';
import { config } from '../config/index.js';

const router = Router();

// GET /health — used by Render/Railway uptime checks and Vapi connectivity tests
router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: config.NODE_ENV,
    version: '1.0.0',
  });
});

export default router;
