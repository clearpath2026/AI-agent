import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { requireVapiSecret } from '../middleware/auth.js';
import { sendSms } from '../services/twilioService.js';
import { getBookingUrl, cancelCalendlyAppointment } from '../services/calendlyService.js';
import { saveJsonLine } from '../utils/storage.js';
import { normalizePhone } from '../utils/phone.js';

const router = Router();

// Every tool endpoint requires the Vapi shared secret
router.use(requireVapiSecret);

// ─────────────────────────────────────────────────────────────────────────────
// Vapi tool-call format:
//
// POST body (from Vapi):
// {
//   "message": {
//     "type": "tool-calls",
//     "toolCallList": [{ "id": "...", "function": { "name": "...", "arguments": {...} } }],
//     "call": { "id": "...", "customer": { "number": "+1..." } }
//   }
// }
//
// Required response format:
// { "results": [{ "toolCallId": "...", "result": "<string the AI will hear>" }] }
//
// For direct curl testing, the fallback path treats the raw body as the args.
// ─────────────────────────────────────────────────────────────────────────────

function extractToolArgs(req) {
  const msg = req.body?.message;

  if (msg?.type === 'tool-calls' && Array.isArray(msg.toolCallList)) {
    const tc = msg.toolCallList[0];
    const rawArgs = tc?.function?.arguments;
    return {
      toolCallId: tc.id,
      // Vapi may send arguments as a JSON string or as a parsed object
      args: typeof rawArgs === 'string' ? JSON.parse(rawArgs) : (rawArgs ?? {}),
      call: msg.call ?? null,
    };
  }

  // Fallback: body is plain args (useful for curl testing without Vapi envelope)
  return { toolCallId: null, args: req.body ?? {}, call: null };
}

function respond(res, toolCallId, result) {
  if (toolCallId) {
    return res.json({ results: [{ toolCallId, result }] });
  }
  return res.json({ result });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /tools/send-calendly-link
//
// Sends a Calendly booking link via SMS to the caller.
// Supports all four appointment types.
//
// Vapi args: { phone_number, appointment_type, caller_name }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/send-calendly-link', async (req, res, next) => {
  try {
    const { toolCallId, args, call } = extractToolArgs(req);
    const { phone_number, appointment_type, caller_name } = args;

    if (!phone_number || !appointment_type) {
      return res.status(400).json({ error: 'phone_number and appointment_type are required' });
    }

    const phone = normalizePhone(phone_number);
    const bookingUrl = await getBookingUrl(appointment_type);

    if (!bookingUrl) {
      return respond(res, toolCallId,
        `I'm sorry, I wasn't able to find a booking link for that appointment type. ` +
        `Please call back during business hours and a staff member will assist you.`
      );
    }

    const smsBody =
      `Hi ${caller_name || 'there'}! Here is your ${appointment_type.replace(/_/g, ' ')} ` +
      `appointment booking link: ${bookingUrl}`;

    await sendSms(phone, smsBody);

    await saveJsonLine('booking_requests', {
      id: uuid(),
      timestamp: new Date().toISOString(),
      caller_name: caller_name || null,
      phone_number: phone,
      appointment_type,
      booking_url: bookingUrl,
      call_id: call?.id ?? null,
    });

    return respond(res, toolCallId,
      `I've sent a booking link to ${phone}. You should receive an SMS shortly. ` +
      `Is there anything else I can help you with?`
    );
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /tools/create-refill-request
//
// ⚠️  HEALTHCARE GUARDRAIL: This endpoint ONLY records the request.
//     It NEVER approves, confirms, or denies a prescription refill.
//     All records are flagged needs_staff_review = true.
//     A licensed provider must review every request before any action.
//
// Vapi args: { phone_number, caller_name, medication_name, pharmacy_name, pharmacy_phone }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/create-refill-request', async (req, res, next) => {
  try {
    const { toolCallId, args, call } = extractToolArgs(req);
    const { phone_number, caller_name, medication_name, pharmacy_name, pharmacy_phone } = args;

    if (!phone_number || !medication_name) {
      return res.status(400).json({ error: 'phone_number and medication_name are required' });
    }

    const refillId = uuid();

    // IMPORTANT: needs_staff_review must always be true — never auto-approve
    await saveJsonLine('refill_requests', {
      id: refillId,
      timestamp: new Date().toISOString(),
      needs_staff_review: true,   // ← never remove this flag
      status: 'pending_review',
      caller_name: caller_name || null,
      phone_number: normalizePhone(phone_number),
      medication_name,
      pharmacy_name: pharmacy_name || null,
      pharmacy_phone: pharmacy_phone || null,
      call_id: call?.id ?? null,
    });

    const shortId = refillId.slice(0, 8).toUpperCase();

    return respond(res, toolCallId,
      `Thank you, ${caller_name || ''}. I've submitted your prescription refill request ` +
      `for ${medication_name} to our clinical staff for review. ` +
      `Please allow 1 to 2 business days for your provider's office to contact you. ` +
      `Your reference number is ${shortId}. ` +
      `Is there anything else I can help you with?`
    );
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /tools/create-sales-lead
//
// Vapi args: { phone_number, caller_name, company_name, interest }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/create-sales-lead', async (req, res, next) => {
  try {
    const { toolCallId, args, call } = extractToolArgs(req);
    const { phone_number, caller_name, company_name, interest } = args;

    if (!phone_number) {
      return res.status(400).json({ error: 'phone_number is required' });
    }

    const leadId = uuid();

    await saveJsonLine('sales_leads', {
      id: leadId,
      timestamp: new Date().toISOString(),
      status: 'new',
      caller_name: caller_name || null,
      phone_number: normalizePhone(phone_number),
      company_name: company_name || null,
      interest: interest || null,
      call_id: call?.id ?? null,
    });

    const shortId = leadId.slice(0, 8).toUpperCase();

    return respond(res, toolCallId,
      `Thanks for your interest${caller_name ? ', ' + caller_name : ''}! ` +
      `I've passed your information to our sales team and someone will reach out ` +
      `to you within one business day. Your reference number is ${shortId}. ` +
      `Is there anything else I can help with?`
    );
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /tools/create-support-ticket
//
// Vapi args: { phone_number, caller_name, issue_description, urgency }
// urgency: "low" | "normal" | "high"
// ─────────────────────────────────────────────────────────────────────────────
router.post('/create-support-ticket', async (req, res, next) => {
  try {
    const { toolCallId, args, call } = extractToolArgs(req);
    const { phone_number, caller_name, issue_description, urgency } = args;

    if (!phone_number || !issue_description) {
      return res.status(400).json({ error: 'phone_number and issue_description are required' });
    }

    const ticketId = uuid();
    const resolvedUrgency = ['low', 'normal', 'high'].includes(urgency) ? urgency : 'normal';

    await saveJsonLine('support_tickets', {
      id: ticketId,
      timestamp: new Date().toISOString(),
      status: 'open',
      caller_name: caller_name || null,
      phone_number: normalizePhone(phone_number),
      issue_description,
      urgency: resolvedUrgency,
      call_id: call?.id ?? null,
    });

    const shortId = ticketId.slice(0, 8).toUpperCase();

    return respond(res, toolCallId,
      `I've created a support ticket for you${caller_name ? ', ' + caller_name : ''}. ` +
      `Your ticket number is ${shortId} and urgency is set to ${resolvedUrgency}. ` +
      `Our support team will follow up with you shortly. ` +
      `Is there anything else I can help with?`
    );
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /tools/cancel-calendly-appointment
//
// Cancels a scheduled Calendly event by UUID.
// The UUID comes from the caller (e.g., from their confirmation email).
//
// Vapi args: { event_uuid, reason, caller_name }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/cancel-calendly-appointment', async (req, res, next) => {
  try {
    const { toolCallId, args, call } = extractToolArgs(req);
    const { event_uuid, reason, caller_name } = args;

    if (!event_uuid) {
      return respond(res, toolCallId,
        `I need your appointment confirmation ID to cancel it. ` +
        `You can find it in your Calendly confirmation email. ` +
        `Could you read that to me?`
      );
    }

    const cancelReason = reason || 'Cancelled by patient via phone';
    const result = await cancelCalendlyAppointment(event_uuid, cancelReason);

    await saveJsonLine('cancellations', {
      id: uuid(),
      timestamp: new Date().toISOString(),
      event_uuid,
      reason: cancelReason,
      caller_name: caller_name || null,
      success: result.success,
      error: result.success ? null : result.message,
      call_id: call?.id ?? null,
    });

    if (result.success) {
      return respond(res, toolCallId,
        `Your appointment has been successfully cancelled${caller_name ? ', ' + caller_name : ''}. ` +
        `You'll receive a cancellation confirmation from Calendly. ` +
        `Would you like me to send you a new booking link to reschedule?`
      );
    }

    return respond(res, toolCallId,
      `I wasn't able to cancel that appointment. ${result.message} ` +
      `Please call back during business hours or visit our website to manage your appointment.`
    );
  } catch (err) {
    next(err);
  }
});

export default router;
