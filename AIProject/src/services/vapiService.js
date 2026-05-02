import { env } from '../config/env.js';

export async function listAssistants() {
  if (!env.VAPI_API_KEY) {
    throw new Error('VAPI_API_KEY is not configured');
  }

  const res = await fetch('https://api.vapi.ai/assistant', {
    headers: {
      Authorization: `Bearer ${env.VAPI_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(`Vapi API error ${res.status}: ${body.message || 'Request failed'}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const items = Array.isArray(data) ? data : (data.results ?? []);

  return items.map((a) => ({
    id: a.id,
    name: a.name ?? '(unnamed)',
    createdAt: a.createdAt ?? null,
  }));
}
