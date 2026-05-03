import { config } from '../config/index.js';
import { getRuntimeKey } from '../config/apiConfig.js';

// ── Internal helpers ──────────────────────────────────────────

function authHeaders() {
  return {
    Authorization: `Bearer ${getRuntimeKey('CALENDLY_API_TOKEN')}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Thin fetch wrapper for the Calendly REST API.
 * Throws a descriptive error on non-2xx responses.
 */
async function calendlyFetch(pathOrUrl, options = {}) {
  const url = pathOrUrl.startsWith('http')
    ? pathOrUrl
    : `${config.CALENDLY_API_BASE}${pathOrUrl}`;

  const res = await fetch(url, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers ?? {}) },
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = body?.message || body?.title || `Calendly API ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }

  return body;
}

// ── Public API ────────────────────────────────────────────────

/**
 * GET /users/me
 * Returns the current user object, including their URI.
 * Use the URI as the `user` query param when listing event types.
 */
export async function getCalendlyMe() {
  return calendlyFetch('/users/me');
}

/**
 * GET /event_types?user=<user_uri>
 * Lists all active event types for the authenticated user.
 */
export async function getEventTypes() {
  const me = await getCalendlyMe();
  const userUri = me?.resource?.uri;

  if (!userUri) {
    throw new Error('Could not resolve Calendly user URI from /users/me');
  }

  return calendlyFetch(`/event_types?user=${encodeURIComponent(userUri)}&count=100&active=true`);
}

/**
 * POST /scheduling_links
 * Creates a single-use scheduling link tied to one event type.
 * The link expires after one booking is made.
 *
 * @param {string} eventTypeUri  Full Calendly event type URI
 */
export async function createSchedulingLink(eventTypeUri) {
  return calendlyFetch('/scheduling_links', {
    method: 'POST',
    body: JSON.stringify({
      max_event_count: 1,
      owner: eventTypeUri,
      owner_type: 'EventType',
    }),
  });
}

/**
 * Returns the booking URL for a given appointment type.
 *
 * Strategy (in order):
 *  1. Static env-var URL  — simplest, reusable link
 *  2. Returns null         — caller should inform the patient gracefully
 *
 * To enable single-use dynamic links, replace step 1 with a call to
 * createSchedulingLink() using the appropriate event type URI for each type.
 *
 * @param {'new_patient'|'existing_patient'|'sales'|'support'} appointmentType
 */
export async function getBookingUrl(appointmentType) {
  const staticUrls = {
    new_patient: getRuntimeKey('CALENDLY_URL_NEW_PATIENT'),
    existing_patient: getRuntimeKey('CALENDLY_URL_EXISTING_PATIENT'),
    sales: getRuntimeKey('CALENDLY_URL_SALES'),
    support: getRuntimeKey('CALENDLY_URL_SUPPORT'),
  };

  return staticUrls[appointmentType] || null;
}

/**
 * POST /scheduled_events/{uuid}/cancellation
 * Cancels a scheduled Calendly event.
 *
 * Returns { success: true } or { success: false, message: "..." }.
 * Never throws — let the caller decide how to handle failure.
 *
 * @param {string} eventUuid  The UUID portion of the scheduled event URI
 * @param {string} reason     Human-readable cancellation reason
 */
export async function cancelCalendlyAppointment(eventUuid, reason) {
  try {
    await calendlyFetch(`/scheduled_events/${eventUuid}/cancellation`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    return { success: true };
  } catch (err) {
    console.error(`[calendly] Cancel failed for ${eventUuid}: ${err.message}`);
    return { success: false, message: err.message };
  }
}
