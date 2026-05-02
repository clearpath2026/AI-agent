#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# curl-tests.sh  — Smoke-test every endpoint (v2: Supabase + LLM)
#
# Usage:
#   BASE_URL=http://localhost:3000 SECRET=your_vapi_secret bash curl-tests.sh
#   BASE_URL=https://your-app.onrender.com SECRET=abc123 bash curl-tests.sh
#
# Requires: curl, jq
# ──────────────────────────────────────────────────────────────────────────────

BASE_URL="${BASE_URL:-http://localhost:3000}"
SECRET="${SECRET:-change_me}"
DIVIDER="═══════════════════════════════════════════════════════"

echo ""
echo "$DIVIDER"
printf "  Testing: %s\n" "$BASE_URL"
echo "$DIVIDER"
echo ""

# Helper: print a section header
section() { echo ""; echo "──────────────────────────────────────"; echo "  $1"; echo "──────────────────────────────────────"; }

# ─── 1. Health Check ──────────────────────────────────────────────────────────
section "1. GET /health"
curl -s "$BASE_URL/health" | jq .

# ─── 2. Calendly: Get Current User ────────────────────────────────────────────
section "2. GET /calendly/me"
curl -s "$BASE_URL/calendly/me" | jq '{uri: .resource.uri, name: .resource.name}'

# ─── 3. Calendly: List Event Types ────────────────────────────────────────────
section "3. GET /calendly/event-types"
curl -s "$BASE_URL/calendly/event-types" | jq '.collection[0] | {name, uri}'

# ─── 4. Calendly: Create Single-Use Scheduling Link ───────────────────────────
section "4. POST /calendly/create-scheduling-link"
echo "  (Replace event_type_uri with a real URI from /calendly/event-types)"
curl -s -X POST "$BASE_URL/calendly/create-scheduling-link" \
  -H "Content-Type: application/json" \
  -d '{"event_type_uri":"https://api.calendly.com/event_types/REPLACE_ME"}' | jq .

# ─── 5. process-call-intent (direct args) ─────────────────────────────────────
section "5. POST /tools/process-call-intent — ambiguous message"
curl -s -X POST "$BASE_URL/tools/process-call-intent" \
  -H "Content-Type: application/json" \
  -H "x-vapi-secret: $SECRET" \
  -d '{
    "message": "Hi, I need to see a doctor next week, I am a new patient",
    "phone": "5551234567",
    "caller_name": "Jane Smith"
  }' | jq .

# ─── 6. process-call-intent — EMERGENCY (critical path test) ──────────────────
section "6. POST /tools/process-call-intent — EMERGENCY DETECTION"
curl -s -X POST "$BASE_URL/tools/process-call-intent" \
  -H "Content-Type: application/json" \
  -H "x-vapi-secret: $SECRET" \
  -d '{"message": "I have severe chest pain and trouble breathing"}' | jq .

# ─── 7. process-call-intent (Vapi envelope format) ────────────────────────────
section "7. POST /tools/process-call-intent — Vapi envelope"
curl -s -X POST "$BASE_URL/tools/process-call-intent" \
  -H "Content-Type: application/json" \
  -H "x-vapi-secret: $SECRET" \
  -d '{
    "message": {
      "type": "tool-calls",
      "toolCallList": [{
        "id": "toolu_intent_001",
        "type": "function",
        "function": {
          "name": "process_call_intent",
          "arguments": {
            "message": "I need to refill my blood pressure medication",
            "phone": "+15551234567"
          }
        }
      }],
      "call": { "id": "call_001", "customer": { "number": "+15551234567" } }
    }
  }' | jq .

# ─── 8. send-calendly-link (direct args) ──────────────────────────────────────
section "8. POST /tools/send-calendly-link — direct args"
curl -s -X POST "$BASE_URL/tools/send-calendly-link" \
  -H "Content-Type: application/json" \
  -H "x-vapi-secret: $SECRET" \
  -d '{
    "phone_number": "5551234567",
    "appointment_type": "new_patient",
    "caller_name": "Jane Smith"
  }' | jq .

# ─── 9. send-calendly-link (Vapi envelope) ────────────────────────────────────
section "9. POST /tools/send-calendly-link — Vapi envelope"
curl -s -X POST "$BASE_URL/tools/send-calendly-link" \
  -H "Content-Type: application/json" \
  -H "x-vapi-secret: $SECRET" \
  -d '{
    "message": {
      "type": "tool-calls",
      "toolCallList": [{
        "id": "toolu_link_001",
        "type": "function",
        "function": {
          "name": "send_calendly_link",
          "arguments": {
            "phone_number": "5551234567",
            "appointment_type": "existing_patient",
            "caller_name": "John Doe",
            "caller_message": "I need to come in for my annual checkup"
          }
        }
      }],
      "call": { "id": "call_002" }
    }
  }' | jq .

# ─── 10. create-refill-request (direct args) ──────────────────────────────────
section "10. POST /tools/create-refill-request"
curl -s -X POST "$BASE_URL/tools/create-refill-request" \
  -H "Content-Type: application/json" \
  -H "x-vapi-secret: $SECRET" \
  -d '{
    "phone_number": "5559876543",
    "caller_name": "Maria Garcia",
    "medication_name": "Lisinopril 10mg",
    "dosage": "10mg",
    "pharmacy_name": "CVS Pharmacy",
    "pharmacy_phone": "5550001111",
    "is_out_of_medication": true
  }' | jq .

# ─── 11. create-refill-request with caller_message for LLM extraction ─────────
section "11. POST /tools/create-refill-request — with caller_message (LLM enrichment)"
curl -s -X POST "$BASE_URL/tools/create-refill-request" \
  -H "Content-Type: application/json" \
  -H "x-vapi-secret: $SECRET" \
  -d '{
    "phone_number": "5559876543",
    "caller_name": "Maria Garcia",
    "medication_name": "Metformin",
    "caller_message": "I need a refill for my Metformin, I take 500mg twice daily, I am almost out, my pharmacy is Walgreens on Main Street"
  }' | jq .

# ─── 12. create-sales-lead ────────────────────────────────────────────────────
section "12. POST /tools/create-sales-lead"
curl -s -X POST "$BASE_URL/tools/create-sales-lead" \
  -H "Content-Type: application/json" \
  -H "x-vapi-secret: $SECRET" \
  -d '{
    "phone_number": "5554445555",
    "caller_name": "Bob Lee",
    "company_name": "Acme Health Tech",
    "interest": "Enterprise telehealth integration and white-label AI receptionist",
    "email": "bob.lee@acmehealthtech.com"
  }' | jq .

# ─── 13. create-support-ticket ────────────────────────────────────────────────
section "13. POST /tools/create-support-ticket"
curl -s -X POST "$BASE_URL/tools/create-support-ticket" \
  -H "Content-Type: application/json" \
  -H "x-vapi-secret: $SECRET" \
  -d '{
    "phone_number": "5556667777",
    "caller_name": "Alice Brown",
    "issue_description": "I cannot log into the patient portal. The password reset email never arrives and I have an appointment tomorrow.",
    "urgency": "high"
  }' | jq .

# ─── 14. cancel-calendly-appointment ──────────────────────────────────────────
section "14. POST /tools/cancel-calendly-appointment"
echo "  (Replace event_uuid with a real Calendly scheduled event UUID)"
curl -s -X POST "$BASE_URL/tools/cancel-calendly-appointment" \
  -H "Content-Type: application/json" \
  -H "x-vapi-secret: $SECRET" \
  -d '{
    "event_uuid": "550e8400-e29b-41d4-a716-446655440000",
    "reason": "Schedule conflict — need to reschedule",
    "caller_name": "Jane Smith"
  }' | jq .

# ─── 15. vapi/call-ended ──────────────────────────────────────────────────────
section "15. POST /vapi/call-ended — end of call webhook"
curl -s -X POST "$BASE_URL/vapi/call-ended" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "type": "end-of-call-report",
      "endedReason": "customer-ended-call",
      "call": {
        "id": "call_ended_test_001",
        "duration": 127,
        "customer": { "number": "+15551234567" },
        "transcript": "Agent: Thank you for calling. How can I help you today? Caller: I need to book a new patient appointment. Agent: I can help with that..."
      }
    }
  }' | jq .

# ─── 16. Auth: Reject missing secret ──────────────────────────────────────────
section "16. AUTH TEST — missing secret should return 401"
curl -s -X POST "$BASE_URL/tools/send-calendly-link" \
  -H "Content-Type: application/json" \
  -d '{"phone_number":"5551234567","appointment_type":"new_patient"}' | jq .

# ─── 17. Validation: missing required field ────────────────────────────────────
section "17. VALIDATION TEST — missing medication_name should return 400"
curl -s -X POST "$BASE_URL/tools/create-refill-request" \
  -H "Content-Type: application/json" \
  -H "x-vapi-secret: $SECRET" \
  -d '{"phone_number": "5551234567"}' | jq .

echo ""
echo "$DIVIDER"
echo "  Done."
echo "$DIVIDER"
echo ""
