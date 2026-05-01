import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Appends one JSON record as a newline to /data/<collection>.jsonl.
 *
 * This is MVP-grade file storage — adequate for local dev and low-volume
 * production. For real deployments, swap this function body with calls to:
 *
 *   Healthcare / PHI data  →  Postgres with encryption at rest, Supabase (+RLS),
 *                              or your EHR system via HL7/FHIR API
 *   CRM leads / tickets    →  HubSpot, Salesforce, or Zendesk API
 *   Audit logs             →  CloudWatch Logs, Datadog, or Papertrail
 *
 * ⚠️  HIPAA NOTE: The /data folder is excluded from git via .gitignore.
 *     In production, ensure the storage backend is covered by a Business
 *     Associate Agreement (BAA) with your cloud provider.
 *
 * @param {string} collection  File name prefix  (e.g. 'refill_requests')
 * @param {object} record      JSON-serializable record to append
 */
export async function saveJsonLine(collection, record) {
  const filePath = join(DATA_DIR, `${collection}.jsonl`);
  const line = JSON.stringify(record) + '\n';

  // appendFileSync is intentionally synchronous to avoid ordering issues
  // on concurrent writes. Replace with an async DB client in production.
  appendFileSync(filePath, line, 'utf8');
}
