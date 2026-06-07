# Forward Deployment Engineer Spec
**Repo:** https://github.com/src-cue/fee-recovery-agent  
**Role:** You are the bridge between the platform and customers. You own: ERP integrations, customer onboarding, API documentation, webhook testing, and provider account setup.

---

## Responsibilities

1. **ERP Adapters** — build and maintain the normalisation layer for each ERP
2. **Customer Onboarding** — guide new schools from signup to first live case
3. **Provider Accounts** — set up and verify Gupshup, Exotel, MSG91 accounts for each tenant
4. **API Docs** — maintain OpenAPI spec and Postman collections
5. **Integration Testing** — verify end-to-end flows for each new ERP or provider
6. **Webhook Debugging** — diagnose and fix delivery issues between ERPs and the platform

---

## ERP Adapters

Each ERP sends data in a different format. An adapter normalises it to the platform's canonical `CaseCreateSchema`.

### Adapter Interface

```typescript
// packages/db/src/types/erp.ts

export interface ERPAdapter {
  name: string;
  // Normalise raw ERP payload to canonical case schema
  normalise(raw: unknown): CaseCreateSchema;
  // Validate that required fields are present in raw payload
  validate(raw: unknown): { valid: boolean; errors: string[] };
  // Transform platform callback to ERP's expected format
  formatCallback(event: CaseStatusEvent): unknown;
}
```

### Fedena Adapter

```typescript
// packages/providers/src/erp/fedena.ts

export class FedenaAdapter implements ERPAdapter {
  name = 'fedena';

  normalise(raw: unknown): CaseCreateSchema {
    const r = raw as FedenaFeeAlert;
    return {
      case_id: String(r.finance_fee_id),
      student_name: `${r.student.first_name} ${r.student.last_name}`,
      parent_name: r.guardian?.name ?? '',
      parent_phone: r.guardian?.mobile_phone ?? r.guardian?.phone,
      parent_email: r.guardian?.email,
      fee_amount: parseFloat(r.balance_fee),
      currency: 'INR',
      due_date: r.due_date,                         // 'YYYY-MM-DD'
      days_overdue: r.days_past_due,
      fee_type: r.fee_collection?.fee_particular ?? 'Tuition Fee',
      payment_link: r.payment_link ?? undefined,
      language: 'en',
      metadata: { erp: 'fedena', fee_id: r.finance_fee_id, class: r.student.class_name }
    };
  }

  validate(raw: unknown) {
    const r = raw as Record<string, unknown>;
    const errors: string[] = [];
    if (!r.finance_fee_id) errors.push('Missing finance_fee_id');
    if (!r.guardian?.mobile_phone && !r.guardian?.phone) errors.push('Missing guardian phone');
    if (!r.balance_fee) errors.push('Missing balance_fee');
    if (!r.due_date) errors.push('Missing due_date');
    return { valid: errors.length === 0, errors };
  }

  formatCallback(event: CaseStatusEvent) {
    return {
      finance_fee_id: event.erp_case_id,
      status: this.mapStatus(event.new_status),
      notes: event.notes,
      promise_date: event.promise_date,
      updated_at: event.timestamp,
    };
  }

  private mapStatus(s: string) {
    const map: Record<string, string> = {
      RESOLVED: 'paid',
      PROMISE_LOGGED: 'promise_received',
      ESCALATED: 'escalated_to_staff',
      HOLD: 'on_hold',
    };
    return map[s] ?? 'in_progress';
  }
}
```

### Entab Adapter (stub — build per their API docs)

```typescript
// packages/providers/src/erp/entab.ts
export class EntabAdapter implements ERPAdapter {
  name = 'entab';
  normalise(raw: unknown): CaseCreateSchema {
    const r = raw as EntabFeeRecord;
    return {
      case_id: r.FeeReceiptNo,
      student_name: r.StudentName,
      parent_phone: r.FatherMobile ?? r.MotherMobile,
      fee_amount: r.PendingAmount,
      currency: 'INR',
      due_date: r.DueDate,
      days_overdue: r.OverdueDays,
      fee_type: r.FeeHead,
      language: 'hi',  // Entab is North India heavy
    };
  }
  // ... validate + formatCallback
}
```

### Generic CSV Adapter (for schools without ERP)

```typescript
// packages/providers/src/erp/csv.ts
// Used when schools upload a spreadsheet directly via dashboard
export class CSVAdapter implements ERPAdapter {
  name = 'csv';
  normalise(raw: unknown): CaseCreateSchema {
    const r = raw as CSVRow;
    return {
      case_id: r.case_id ?? `csv-${Date.now()}-${Math.random()}`,
      student_name: r.student_name ?? r['Student Name'],
      parent_phone: r.parent_phone ?? r['Parent Phone'] ?? r['Mobile'],
      fee_amount: parseFloat(r.fee_amount ?? r['Fee Amount'] ?? r['Amount']),
      currency: r.currency ?? 'INR',
      due_date: r.due_date ?? r['Due Date'],
      days_overdue: parseInt(r.days_overdue ?? '0'),
      fee_type: r.fee_type ?? r['Fee Type'] ?? 'Fee',
      payment_link: r.payment_link ?? r['Payment Link'],
      notes: r.notes ?? r['Notes'],
      language: r.language ?? 'en',
    };
  }
  // ...
}
```

---

## Customer Onboarding Runbook

### Step 1 — Account Setup (30 min)

```
[ ] School signs up via /onboarding page (or you create tenant via admin API)
[ ] Record: school name, ERP type, primary contact name + email + phone
[ ] Issue API key → send to school's technical contact
[ ] Record callback URL from school (or confirm they'll use CSV upload)
[ ] Set plan: Starter (default)
```

### Step 2 — Provider Setup (1–2 hrs)

**WhatsApp:**
```
[ ] Ask school: do they have an existing WABA? 
    - Yes → they share WABA ID, connect to Gupshup via BSP link
    - No → onboard as sub-account under platform's WABA (faster, 1 day)
[ ] Load default templates into their WABA namespace:
    Template names: fee_reminder_d1, fee_reminder_d5, fee_installment_d10
    Languages: en + hi minimum
[ ] Send test message to school admin's own phone
[ ] Confirm delivery ✓
```

**Calling:**
```
[ ] Exotel: create sub-account or use platform account with school's DID
[ ] Record virtual number assigned to school
[ ] Test outbound call to school admin's phone
[ ] Confirm call connects and plays test audio ✓
```

**DND:**
```
[ ] Verify MSG91 DND check is active for school's tenant config
[ ] Test: run one known DND number through the check — confirm it blocks
```

### Step 3 — Integration Test (30 min)

```
[ ] Send 1 test case via API: POST /v1/cases with test student data
[ ] Verify WA message arrives on test phone within 60 seconds
[ ] Verify case appears in dashboard with ACTIVE status
[ ] Reply "will pay tomorrow" from test phone
[ ] Verify intent classified as "promise" in dashboard timeline
[ ] Verify ERP callback fires to school's callback URL (check their server logs)
[ ] Confirm case status updates to PROMISE_LOGGED
[ ] Mark test case as resolved: POST /v1/cases/:id/resolve
[ ] Check dashboard shows recovery rate updated ✓
```

### Step 4 — First Live Batch (with school present)

```
[ ] School uploads first CSV of real overdue cases (start with 10–20 max)
[ ] Review parsed preview together — confirm column mapping is correct
[ ] Submit upload
[ ] Monitor dashboard for 10 minutes — watch first messages send
[ ] Confirm school admin can see cases and timeline in dashboard
[ ] Record any issues in GitHub Issues with label `customer-onboarding`
```

### Step 5 — Handoff Checklist

```
[ ] School admin trained on: case list, bulk upload, template manager, reminder settings
[ ] School has: API key, webhook secret, link to API docs, Slack/WhatsApp support contact
[ ] Runbook created in Notion: school name, ERP type, WA provider, special config
[ ] Added to billing: plan confirmed, token balance confirmed
[ ] Set up monthly recovery report auto-email: POST /v1/settings/reports
```

---

## Webhook Testing Guide

When a school's ERP is not sending webhooks correctly, use this process:

### 1. Verify inbound delivery

Use `ngrok` to expose your local API and inspect raw payloads:
```bash
ngrok http 3001
# Give school the ngrok URL temporarily: https://xxxx.ngrok.io/v1/cases
```

Check raw payload in ngrok inspector: `http://localhost:4040`

### 2. Validate payload against schema

```bash
curl -X POST https://api.feerecovery.ai/v1/cases \
  -H "Authorization: Bearer frk_live_xxxx" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-$(date +%s)" \
  -d '{
    "case_id": "TEST-001",
    "parent_phone": "+919876543210",
    "fee_amount": 15000,
    "currency": "INR",
    "due_date": "2025-05-25",
    "days_overdue": 5
  }'
```

### 3. Verify callback delivery

Ask school to share logs from their server at the callback URL. If they can't, use RequestBin:
```bash
# Create a RequestBin URL and temporarily set it as the school's callback_url
PUT /v1/settings
{ "callback_url": "https://requestbin.com/r/xxxx" }
```

Trigger a case status change and check RequestBin for the callback payload.

### 4. Verify webhook signature

Schools should validate the `signature` header on callbacks:
```typescript
import crypto from 'crypto';

function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

Share this snippet with school's tech team.

---

## API Documentation

Maintain `docs/api/openapi.yaml` (OpenAPI 3.1).  
Publish to: `https://docs.feerecovery.ai` using Mintlify (free for open-source) or Redoc.

**Required for every endpoint:**
- Request schema with all fields documented
- Response schema with all fields documented
- At least one example request + response
- Error codes and their meaning
- Rate limit notes where applicable

**Postman Collection:**  
Maintain `docs/api/fee-recovery.postman_collection.json`.  
Include environment variables: `base_url`, `api_key`, `tenant_id`.  
Export updated collection on every new endpoint added.

---

## Provider Account Checklist (per new tenant)

```
WHATSAPP (Gupshup)
[ ] Gupshup sub-account created or school's WABA linked
[ ] App name registered
[ ] Templates submitted: fee_reminder_d1, fee_reminder_d5, fee_installment_d10
[ ] Inbound webhook URL set to: https://api.feerecovery.ai/v1/webhooks/whatsapp
[ ] Test message sent and received ✓

CALLING (Exotel)
[ ] Exotel account / sub-account active
[ ] Virtual number (DID) assigned and recorded in tenant config
[ ] StatusCallback URL set to: https://api.feerecovery.ai/v1/webhooks/call-events
[ ] Recording callback set to: https://api.feerecovery.ai/v1/webhooks/call-recording
[ ] Test call made and received ✓

SMS (MSG91)
[ ] MSG91 account active, sender ID registered with TRAI
[ ] DLT registration complete (mandatory for India)
[ ] Inbound webhook set to: https://api.feerecovery.ai/v1/webhooks/sms-inbound
[ ] Test SMS sent ✓
[ ] DND check API key recorded in tenant config
```

---

## Acceptance Criteria

- [ ] Fedena adapter normalises payload correctly for 5 different Fedena payload shapes
- [ ] CSV adapter handles missing optional columns without crashing
- [ ] New school completes onboarding (Steps 1-5) in under 4 hours
- [ ] Webhook signature verification documented and school tech teams confirm working
- [ ] OpenAPI spec covers all endpoints in `BACKEND.md`
- [ ] Postman collection has working examples for all core flows
- [ ] Provider setup checklist completed and signed off for each new tenant
- [ ] All onboarding runbooks stored in Notion with school name + date
