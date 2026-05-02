/**
 * Calendly API proxy endpoints.
 * Used for testing API access and creating scheduling links.
 * Not protected by Vapi secret — protect with network rules or basic auth in production.
 */

import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  getCalendlyMe,
  getEventTypes,
  createSchedulingLink,
} from '../services/calendlyService.js';

const router = Router();

// GET /calendly/me — verify token and retrieve your Calendly user URI
router.get('/me', asyncHandler(async (_req, res) => {
  const data = await getCalendlyMe();
  res.json(data);
}));

// GET /calendly/event-types — list all active event types for the account
router.get('/event-types', asyncHandler(async (_req, res) => {
  const data = await getEventTypes();
  res.json(data);
}));

// POST /calendly/create-scheduling-link
// Creates a single-use link (expires after one booking — good for patient privacy)
// Body: { "event_type_uri": "https://api.calendly.com/event_types/XXXX" }
router.post('/create-scheduling-link', asyncHandler(async (req, res) => {
  const { event_type_uri } = req.body;

  if (!event_type_uri) {
    return res.status(400).json({ error: 'event_type_uri is required' });
  }

  const data = await createSchedulingLink(event_type_uri);
  res.json(data);
}));

export default router;
