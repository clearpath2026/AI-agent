/**
 * Vapi webhook routes.
 * Handles end-of-call reports and logs call metadata to Supabase.
 *
 * ⚠️  HIPAA NOTE: Call transcripts are NOT stored here.
 *     Store transcripts only if your Supabase instance is covered by a signed
 *     BAA with Supabase (available on their HIPAA plan) or use a dedicated
 *     HIPAA-compliant storage layer.
 */

import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logAudit } from '../utils/audit.js';
import { normalizePhone } from '../utils/phone.js';
import { insertCallLog } from '../services/supabaseService.js';
import { summarizeCall, classifyCallIntent } from '../services/llmService.js';

const router = Router();

// POST /vapi/call-ended
// Vapi sends an "end-of-call-report" message when every call finishes.
router.post('/call-ended', asyncHandler(async (req, res) => {
  const msg = req.body?.message ?? req.body ?? {};
  const call = msg?.call ?? {};

  const rawPhone = call?.customer?.number ?? null;
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  const transcript = call?.transcript ?? msg?.transcript ?? null;

  // ── LLM enrichment: summarize and classify (best-effort, don't fail the webhook) ──
  let summary = null;
  let intent = null;

  if (transcript) {
    try {
      // Run both in parallel to save time
      const [summaryResult, intentResult] = await Promise.all([
        summarizeCall({
          transcript,
          ended_reason: call?.endedReason ?? msg?.endedReason,
          duration_seconds: call?.duration,
        }),
        classifyCallIntent(transcript),
      ]);

      summary = summaryResult?.summary ?? null;
      intent = intentResult?.intent ?? null;
    } catch (err) {
      console.error('[vapi/call-ended] LLM processing failed:', err.message);
      // Continue without summary — don't fail the webhook
    }
  }

  // ── Save call log ─────────────────────────────────────────────────────────
  const record = await insertCallLog({
    vapi_call_id: call?.id ?? null,
    phone,
    caller_name: call?.customer?.name ?? null,
    intent,
    // transcript: null,  ← Intentionally omitted — set to `transcript` with HIPAA BAA
    transcript: null,
    summary,
    structured_data: {
      ended_reason: call?.endedReason ?? msg?.endedReason ?? null,
      duration_seconds: call?.duration ?? null,
      assistant_id: call?.assistantId ?? null,
    },
    raw_payload: {
      call_id: call?.id ?? null,
      ended_reason: call?.endedReason ?? msg?.endedReason ?? null,
      duration: call?.duration ?? null,
    },
  });

  await logAudit('call.ended', 'call_logs', record?.id ?? null, {
    intent,
    ended_reason: call?.endedReason ?? msg?.endedReason ?? null,
    duration_seconds: call?.duration ?? null,
  });

  res.json({ received: true });
}));

export default router;
