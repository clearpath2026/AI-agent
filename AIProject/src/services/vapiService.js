import { getRuntimeKey } from '../config/apiConfig.js';

export async function listAssistants() {
  const apiKey = getRuntimeKey('VAPI_API_KEY');
  if (!apiKey) {
    throw new Error('VAPI_API_KEY is not configured');
  }

  const res = await fetch('https://api.vapi.ai/assistant', {
    headers: {
      Authorization: `Bearer ${apiKey}`,
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

export async function listPhoneNumbers() {
  const apiKey = getRuntimeKey('VAPI_API_KEY');
  if (!apiKey) {
    throw new Error('VAPI_API_KEY is not configured');
  }

  const res = await fetch('https://api.vapi.ai/phone-number', {
    headers: {
      Authorization: `Bearer ${apiKey}`,
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

  return items.map((p) => ({
    id: p.id,
    number: p.number ?? null,
    name: p.name ?? '(unnamed)',
    assistantId: p.assistantId ?? null,
    createdAt: p.createdAt ?? null,
  }));
}

export async function updatePhoneNumberAssistant(phoneNumberId, assistantId) {
  const apiKey = getRuntimeKey('VAPI_API_KEY');
  if (!apiKey) {
    throw new Error('VAPI_API_KEY is not configured');
  }

  const res = await fetch(`https://api.vapi.ai/phone-number/${phoneNumberId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ assistantId: assistantId || null }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(`Vapi API error ${res.status}: ${body.message || 'Request failed'}`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

export async function createOutboundCall({ toNumber, assistantId, phoneNumberId, firstMessage }) {
  const apiKey = getRuntimeKey('VAPI_API_KEY');
  if (!apiKey) {
    throw new Error('VAPI_API_KEY is not configured');
  }

  const body = {
    assistantId,
    customer: { number: toNumber },
    phoneNumberId,
  };

  if (firstMessage) {
    body.assistantOverrides = { firstMessage };
  }

  const res = await fetch('https://api.vapi.ai/call/phone', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const responseBody = await res.json().catch(() => ({}));
    const err = new Error(`Vapi API error ${res.status}: ${responseBody.message || 'Request failed'}`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}
