import { Router } from 'express';
import {
  getCalendlyMe,
  getEventTypes,
  createSchedulingLink,
} from '../services/calendlyService.js';

const router = Router();

// ── GET /calendly/me ──────────────────────────────────────────
// Smoke-test your API token and retrieve your Calendly user URI.
// The user URI is needed when fetching event types or creating links.
router.get('/me', async (_req, res, next) => {
  try {
    const data = await getCalendlyMe();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// ── GET /calendly/event-types ─────────────────────────────────
// Lists all event types for the authenticated user.
// Use the returned URIs to create single-use scheduling links.
router.get('/event-types', async (_req, res, next) => {
  try {
    const data = await getEventTypes();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// ── POST /calendly/create-scheduling-link ─────────────────────
// Creates a single-use Calendly scheduling link for one event type.
// Single-use links expire after one booking — good for patient privacy.
//
// Body: { "event_type_uri": "https://api.calendly.com/event_types/XXXXXXXX" }
router.post('/create-scheduling-link', async (req, res, next) => {
  try {
    const { event_type_uri } = req.body;

    if (!event_type_uri) {
      return res.status(400).json({ error: 'event_type_uri is required' });
    }

    const data = await createSchedulingLink(event_type_uri);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;
