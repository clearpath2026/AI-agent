import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { saveJsonLine } from '../utils/storage.js';

const router = Router();

// ── POST /vapi/call-ended ─────────────────────────────────────
// Vapi sends an "end-of-call-report" webhook when every call finishes.
// We log non-PHI metadata for analytics / audit trail.
//
// ⚠️  HIPAA NOTE: We intentionally do NOT store the transcript here.
//     If you need transcripts, store them in a HIPAA-compliant system
//     (e.g., encrypted S3, Supabase with RLS) and apply a BAA with the vendor.
router.post('/call-ended', async (req, res, next) => {
  try {
    const msg = req.body?.message ?? req.body;
    const call = msg?.call ?? {};

    await saveJsonLine('call_logs', {
      id: uuid(),
      logged_at: new Date().toISOString(),
      call_id: call?.id ?? msg?.callId ?? null,
      ended_reason: call?.endedReason ?? msg?.endedReason ?? null,
      duration_seconds: call?.duration ?? null,
      // Storing caller number is PHI — mask or omit if not needed for ops
      caller_number_last4: call?.customer?.number?.slice(-4) ?? null,
      // transcript intentionally omitted — store externally if required
    });

    res.json({ received: true });
  } catch (err) {
    next(err);
  }
});

export default router;
