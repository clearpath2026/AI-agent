/**
 * Vapi custom tool endpoints.
 * All routes are protected by the shared Vapi secret (x-vapi-secret header).
 *
 * Vapi tool-call request format:
 * {
 *   "message": {
 *     "type": "tool-calls",
 *     "toolCallList": [{ "id": "...", "function": { "name": "...", "arguments": {...} } }],
 *     "call": { "id": "...", "customer": { "number": "+1..." } }
 *   }
 * }
 *
 * Required response format for Vapi:
 * { "results": [{ "toolCallId": "...", "result": "<string the AI hears>" }] }
 *
 * For direct curl testing without Vapi envelope, plain JSON body also works.
 */

import { Router } from 'express';
import { requireVapiSecret } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logAudit } from '../utils/audit.js';
import { normalizePhone } from '../utils/phone.js';
import { sendSms } from '../services/twilioService.js';
import { getBookingUrl, cancelCalendlyAppointment } from '../services/calendlyService.js';
import {
  insertAppointment,
  insertRefillRequest,
  insertSalesLead,
  insertSupportTicket,
} from '../services/supabaseService.js';
import {
  classifyCallIntent,
  extractAppointmentDetails,
  extractRefillDetails,
  extractSalesLead,
  extractSupportTicket,
  generateStaffNote,
} from '../services/llmService.js';
import {
  processIntentSchema,
  appointmentSchema,
  refillSchema,
  salesLeadSchema,
  supportTicketSchema,
  cancelAppointmentSchema,
  validate,
} from '../validators/toolSchemas.js';

const router = Router();
router.use(requireVapiSecret);

// ── Shared helpers ────────────────────────────────────────────────────────────

/**
 * Unwrap the Vapi tool-call envelope.
 * If the body is NOT a Vapi envelope (direct API call / curl test),
 * treat the raw body as the tool arguments.
 */
function extractToolArgs(req) {
  const msg = req.body?.message;

  if (msg?.type === 'tool-calls' && Array.isArray(msg.toolCallList)) {
    const tc = msg.toolCallList[0];
    const rawArgs = tc?.function?.arguments;
    return {
      toolCallId: tc.id,
      // Vapi may send arguments as a JSON string or an already-parsed object
      args: typeof rawArgs === 'string' ? JSON.parse(rawArgs) : (rawArgs ?? {}),
      call: msg.call ?? null,
    };
  }

  return { toolCallId: null, args: req.body ?? {}, call: null };
}

/**
 * Send the correct response format depending on whether this was a Vapi call
 * (needs the results array) or a direct API call (plain JSON).
 */
function toolResponse(res, toolCallId, result) {
  if (toolCallId) {
    return res.json({ results: [{ toolCallId, result }] });
  }
  return res.json({ result });
}

/** Translate Zod validation errors into a Vapi-compatible response. */
function validationError(res, toolCallId, errors) {
  const message = `Validation error: ${errors.join('; ')}`;
  if (toolCallId) {
    return res.status(400).json({ results: [{ toolCallId, result: message }] });
  }
  return res.status(400).json({ error: message });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /tools/process-call-intent
//
// The AI calls this when a caller's intent is ambiguous.
// Uses LLM to classify intent and return recommended next action.
//
// Args: { message, phone?, caller_name? }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/process-call-intent', asyncHandler(async (req, res) => {
  const { toolCallId, args } = extractToolArgs(req);

  const validation = validate(processIntentSchema, args);
  if (!validation.success) return validationError(res, toolCallId, validation.errors);

  const { message, phone, caller_name } = validation.data;
  const normalizedPhone = phone ? normalizePhone(phone) : null;

  // ── LLM classification ────────────────────────────────────────────────────
  const classification = await classifyCallIntent(message);

  // Emergency: drop everything else and direct to 911
  if (classification.is_emergency || classification.intent === 'emergency') {
    await logAudit('intent.emergency_detected', 'call_logs', null, {
      phone: normalizedPhone,
      caller_name: caller_name || null,
      message_snippet: message.slice(0, 100),
    });

    const emergencyMsg =
      'This sounds like a medical emergency. Please hang up right now and call 9-1-1 ' +
      'immediately, or have someone drive you to the nearest emergency room. ' +
      'Do not wait. Call 9-1-1 now.';

    return toolResponse(res, toolCallId, emergencyMsg);
  }

  // Log the intent classification for analytics
  await logAudit('intent.classified', 'call_logs', null, {
    phone: normalizedPhone,
    caller_name: caller_name || null,
    intent: classification.intent,
    confidence: classification.confidence,
  });

  // When called as a Vapi tool, return a rich result string the AI can act on.
  // The AI reads this as context for its next turn.
  if (toolCallId) {
    const resultStr = [
      `INTENT: ${classification.intent}`,
      `CONFIDENCE: ${Math.round((classification.confidence ?? 0) * 100)}%`,
      `NEXT_ACTION: ${classification.recommended_action || 'none'}`,
      classification.missing_fields?.length
        ? `MISSING: ${classification.missing_fields.join(', ')}`
        : null,
      `SAY: ${classification.safe_response || ''}`,
    ]
      .filter(Boolean)
      .join('\n');

    return res.json({ results: [{ toolCallId, result: resultStr }] });
  }

  // Direct API call — return the full classification object
  return res.json({
    intent: classification.intent,
    confidence: classification.confidence,
    reasoning: classification.reasoning,
    is_emergency: classification.is_emergency,
    missing_fields: classification.missing_fields ?? [],
    recommended_action: classification.recommended_action,
    safe_response: classification.safe_response,
  });
}));

// ─────────────────────────────────────────────────────────────────────────────
// POST /tools/send-calendly-link
//
// Sends an appointment booking link to the caller via SMS.
// Saves the appointment record to Supabase.
//
// Args: { phone_number, appointment_type, caller_name?, caller_message? }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/send-calendly-link', asyncHandler(async (req, res) => {
  const { toolCallId, args, call } = extractToolArgs(req);

  const validation = validate(appointmentSchema, args);
  if (!validation.success) return validationError(res, toolCallId, validation.errors);

  const { phone_number, appointment_type, caller_name, caller_message } = validation.data;
  const phone = normalizePhone(phone_number);

  // If free-text message was provided, use LLM to enrich details (best-effort)
  let llmDetails = {};
  if (caller_message) {
    llmDetails = await extractAppointmentDetails(caller_message).catch((err) => {
      console.warn('[tools] LLM enrichment failed (appointment):', err.message);
      return {};
    });
  }

  // Get booking URL — static env var (or null if not configured)
  const bookingUrl = await getBookingUrl(appointment_type);

  if (!bookingUrl) {
    return toolResponse(res, toolCallId,
      `I wasn't able to find a booking link for that appointment type. ` +
      `Please call back during business hours and a staff member will assist you.`
    );
  }

  // Send SMS
  await sendSms(
    phone,
    `Hi ${caller_name || 'there'}! Here is your ${appointment_type.replace(/_/g, ' ')} ` +
    `booking link: ${bookingUrl}`
  );

  // Persist to Supabase
  const record = await insertAppointment({
    caller_name: caller_name || llmDetails.caller_name || null,
    phone,
    email: llmDetails.email || null,
    appointment_type,
    calendly_link: bookingUrl,
    status: 'link_sent',
    raw_payload: {
      call_id: call?.id ?? null,
      args,
      llm_details: llmDetails,
    },
  });

  await logAudit('appointment.link_sent', 'appointments', record.id, {
    phone,
    appointment_type,
  });

  return toolResponse(res, toolCallId,
    `I've sent a booking link to your phone number ending in ${phone.slice(-4)}. ` +
    `You should receive a text message shortly. Is there anything else I can help you with?`
  );
}));

// ─────────────────────────────────────────────────────────────────────────────
// POST /tools/create-refill-request
//
// ⚠️  HEALTHCARE GUARDRAIL — READ CAREFULLY:
//   - This endpoint records an INTAKE REQUEST only.
//   - The LLM enriches the data but does NOT assess clinical appropriateness.
//   - status is ALWAYS 'needs_staff_review' — enforced in supabaseService.
//   - A licensed provider must review every record before any action is taken.
//
// Args: { phone_number, medication_name, caller_name?, dosage?,
//         pharmacy_name?, pharmacy_phone?, date_of_birth?,
//         is_out_of_medication?, caller_message? }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/create-refill-request', asyncHandler(async (req, res) => {
  const { toolCallId, args, call } = extractToolArgs(req);

  const validation = validate(refillSchema, args);
  if (!validation.success) return validationError(res, toolCallId, validation.errors);

  const {
    phone_number,
    caller_name,
    medication_name,
    dosage,
    pharmacy_name,
    pharmacy_phone,
    date_of_birth,
    is_out_of_medication,
    caller_message,
  } = validation.data;

  const phone = normalizePhone(phone_number);

  // LLM extracts additional structure from free-text (best-effort)
  let llmDetails = {};
  if (caller_message) {
    llmDetails = await extractRefillDetails(caller_message).catch((err) => {
      console.warn('[tools] LLM enrichment failed (refill):', err.message);
      return {};
    });
  }

  // Generate a staff note — LLM is guardrailed never to approve
  const staffNoteResult = await generateStaffNote('refill_request', {
    medication_name,
    dosage,
    pharmacy: pharmacy_name,
    is_out_of_medication,
  }).catch(() => ({
    staff_note: 'Prescription refill request received via phone. Requires clinical review before any action.',
  }));

  // Save to Supabase — supabaseService forces status = 'needs_staff_review'
  const record = await insertRefillRequest({
    patient_name: caller_name || llmDetails.patient_name || null,
    date_of_birth: date_of_birth || llmDetails.date_of_birth || null,
    phone,
    medication_name: medication_name || llmDetails.medication_name,
    dosage: dosage || llmDetails.dosage || null,
    pharmacy: pharmacy_name || llmDetails.pharmacy || null,
    is_out_of_medication: is_out_of_medication ?? llmDetails.is_out_of_medication ?? false,
    notes: pharmacy_phone ? `Pharmacy phone: ${pharmacy_phone}` : (llmDetails.notes || null),
    staff_note: staffNoteResult.staff_note,
    raw_payload: {
      call_id: call?.id ?? null,
      args,
      llm_details: llmDetails,
    },
  });

  await logAudit('refill_request.created', 'refill_requests', record.id, {
    phone,
    // Omit medication name from audit log to reduce unnecessary PHI exposure
    record_id: record.id,
  });

  const shortId = record.id.slice(0, 8).toUpperCase();

  return toolResponse(res, toolCallId,
    `Thank you${caller_name ? ', ' + caller_name : ''}. ` +
    `I've submitted your prescription refill request to our clinical staff for review. ` +
    `Please allow 1 to 2 business days for a response. ` +
    `A licensed provider will review your request — I am not able to guarantee approval. ` +
    `Your reference number is ${shortId}. ` +
    `Is there anything else I can help you with?`
  );
}));

// ─────────────────────────────────────────────────────────────────────────────
// POST /tools/create-sales-lead
//
// Args: { phone_number, caller_name?, company_name?, interest?, email?,
//         caller_message? }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/create-sales-lead', asyncHandler(async (req, res) => {
  const { toolCallId, args, call } = extractToolArgs(req);

  const validation = validate(salesLeadSchema, args);
  if (!validation.success) return validationError(res, toolCallId, validation.errors);

  const { phone_number, caller_name, company_name, interest, email, caller_message } =
    validation.data;
  const phone = normalizePhone(phone_number);

  let llmDetails = {};
  if (caller_message) {
    llmDetails = await extractSalesLead(caller_message).catch(() => ({}));
  }

  const staffNoteResult = await generateStaffNote('sales_lead', {
    name: caller_name,
    company: company_name,
    interest,
  }).catch(() => ({ staff_note: 'New sales inquiry received via phone. Follow up within 1 business day.' }));

  const record = await insertSalesLead({
    name: caller_name || llmDetails.name || null,
    company: company_name || llmDetails.company || null,
    phone,
    email: email || llmDetails.email || null,
    interest: interest || llmDetails.interest || null,
    staff_note: staffNoteResult.staff_note,
    raw_payload: { call_id: call?.id ?? null, args },
  });

  await logAudit('sales_lead.created', 'sales_leads', record.id, { phone });

  const shortId = record.id.slice(0, 8).toUpperCase();

  return toolResponse(res, toolCallId,
    `Thanks for your interest${caller_name ? ', ' + caller_name : ''}! ` +
    `I've passed your information to our sales team. ` +
    `Someone will reach out to you within one business day. ` +
    `Your reference number is ${shortId}. ` +
    `Is there anything else I can help with?`
  );
}));

// ─────────────────────────────────────────────────────────────────────────────
// POST /tools/create-support-ticket
//
// Args: { phone_number, issue_description, caller_name?, urgency?,
//         caller_message? }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/create-support-ticket', asyncHandler(async (req, res) => {
  const { toolCallId, args, call } = extractToolArgs(req);

  const validation = validate(supportTicketSchema, args);
  if (!validation.success) return validationError(res, toolCallId, validation.errors);

  const { phone_number, caller_name, issue_description, urgency, caller_message } =
    validation.data;
  const phone = normalizePhone(phone_number);

  let llmDetails = {};
  if (caller_message) {
    llmDetails = await extractSupportTicket(caller_message).catch(() => ({}));
  }

  const staffNoteResult = await generateStaffNote('support_ticket', {
    issue: issue_description,
    urgency,
  }).catch(() => ({ staff_note: 'Support ticket submitted via phone. Review and respond promptly.' }));

  const record = await insertSupportTicket({
    name: caller_name || llmDetails.name || null,
    phone,
    email: llmDetails.email || null,
    issue_summary: issue_description || llmDetails.issue_summary,
    urgency: urgency || llmDetails.urgency || 'normal',
    staff_note: staffNoteResult.staff_note,
    raw_payload: { call_id: call?.id ?? null, args },
  });

  await logAudit('support_ticket.created', 'support_tickets', record.id, { phone, urgency });

  const shortId = record.id.slice(0, 8).toUpperCase();

  return toolResponse(res, toolCallId,
    `I've opened a support ticket for you${caller_name ? ', ' + caller_name : ''}. ` +
    `Your ticket number is ${shortId} with ${urgency || 'normal'} urgency. ` +
    `Our support team will follow up with you shortly. ` +
    `Is there anything else I can help with?`
  );
}));

// ─────────────────────────────────────────────────────────────────────────────
// POST /tools/cancel-calendly-appointment
//
// Cancels a scheduled Calendly event. Requires the event UUID from the
// caller's Calendly confirmation email.
//
// Args: { event_uuid, reason?, caller_name? }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/cancel-calendly-appointment', asyncHandler(async (req, res) => {
  const { toolCallId, args, call } = extractToolArgs(req);

  const validation = validate(cancelAppointmentSchema, args);
  if (!validation.success) {
    // Give the caller a friendly message instead of exposing "invalid UUID"
    return toolResponse(res, toolCallId,
      `I need your appointment confirmation ID to cancel it. ` +
      `You can find it in your Calendly confirmation email — it looks like a long string of letters and numbers. ` +
      `Could you read that to me?`
    );
  }

  const { event_uuid, reason, caller_name } = validation.data;
  const cancelReason = reason || 'Cancelled by patient via phone';

  const result = await cancelCalendlyAppointment(event_uuid, cancelReason);

  await logAudit('appointment.cancelled', 'appointments', null, {
    event_uuid,
    reason: cancelReason,
    success: result.success,
    caller_name: caller_name || null,
    call_id: call?.id ?? null,
  });

  if (result.success) {
    return toolResponse(res, toolCallId,
      `Your appointment has been successfully cancelled${caller_name ? ', ' + caller_name : ''}. ` +
      `You'll receive a cancellation confirmation from Calendly. ` +
      `Would you like me to send you a new booking link so you can reschedule at a time that works for you?`
    );
  }

  return toolResponse(res, toolCallId,
    `I wasn't able to cancel that appointment. ${result.message} ` +
    `Please call back during business hours or visit our website to manage your appointment directly.`
  );
}));

export default router;
