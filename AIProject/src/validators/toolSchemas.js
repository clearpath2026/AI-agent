/**
 * Zod validation schemas for every Vapi tool endpoint.
 *
 * These schemas validate the TOOL ARGUMENTS extracted from the Vapi envelope,
 * not the full Vapi request body. See extractToolArgs() in each route for
 * how the envelope is unwrapped before validation.
 */

import { z } from 'zod';

// ── Reusable base types ───────────────────────────────────────────────────────

const phoneField = z
  .string()
  .min(7, 'phone_number must contain at least 7 digits')
  .describe('Caller phone number — any format accepted, normalized server-side');

const optionalString = z.string().optional();

// ── Tool schemas ──────────────────────────────────────────────────────────────

export const processIntentSchema = z.object({
  message: z.string().min(1, 'message is required — provide the caller transcript or utterance'),
  phone: phoneField.optional(),
  caller_name: optionalString,
});

export const appointmentSchema = z.object({
  phone_number: phoneField,
  appointment_type: z.enum(['new_patient', 'existing_patient', 'sales', 'support'], {
    errorMap: () => ({
      message: 'appointment_type must be new_patient | existing_patient | sales | support',
    }),
  }),
  caller_name: optionalString,
  // Optional free-text message — used by LLM to enrich extracted details
  caller_message: optionalString,
});

export const refillSchema = z.object({
  phone_number: phoneField,
  caller_name: optionalString,
  medication_name: z.string().min(1, 'medication_name is required'),
  dosage: optionalString,
  pharmacy_name: optionalString,
  pharmacy_phone: optionalString,
  date_of_birth: optionalString,
  is_out_of_medication: z.boolean().optional().default(false),
  caller_message: optionalString,
});

export const salesLeadSchema = z.object({
  phone_number: phoneField,
  caller_name: optionalString,
  company_name: optionalString,
  interest: optionalString,
  email: z.string().email('Invalid email format').optional(),
  caller_message: optionalString,
});

export const supportTicketSchema = z.object({
  phone_number: phoneField,
  caller_name: optionalString,
  issue_description: z
    .string()
    .min(5, 'issue_description must be at least 5 characters'),
  urgency: z.enum(['low', 'normal', 'high']).optional().default('normal'),
  caller_message: optionalString,
});

export const cancelAppointmentSchema = z.object({
  event_uuid: z.string().uuid('event_uuid must be a valid UUID (found in the Calendly confirmation email)'),
  reason: optionalString,
  caller_name: optionalString,
});

// ── Validation helper ─────────────────────────────────────────────────────────

/**
 * Run a Zod schema against data.
 * Returns { success: true, data } or { success: false, errors: string[] }
 *
 * @template T
 * @param {import('zod').ZodType<T>} schema
 * @param {unknown} data
 * @returns {{ success: true, data: T } | { success: false, errors: string[] }}
 */
export function validate(schema, data) {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = result.error.errors.map(
    (e) => `${e.path.length ? e.path.join('.') + ': ' : ''}${e.message}`
  );
  return { success: false, errors };
}
