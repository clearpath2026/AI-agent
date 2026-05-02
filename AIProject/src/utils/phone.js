/**
 * Normalize a phone number to E.164 format.
 *
 * Rules:
 *  - Already has + prefix       → return as-is
 *  - 11 digits starting with 1  → +1XXXXXXXXXX  (US/CA)
 *  - 10 digits                  → +1XXXXXXXXXX  (assume US)
 *  - Anything else              → +<digits>
 *
 * @param {string} raw  Raw phone number from caller / tool args
 * @returns {string}    E.164 formatted number or original if unusable
 */
export function normalizePhone(raw) {
  if (!raw) return raw;

  // Strip all non-digit characters except a leading +
  const stripped = String(raw).replace(/[^\d+]/g, '');

  if (stripped.startsWith('+')) return stripped;

  const digits = stripped.replace(/\D/g, '');

  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;

  // International number without country code prefix — best-effort
  return `+${digits}`;
}
