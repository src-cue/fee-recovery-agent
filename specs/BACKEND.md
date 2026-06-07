# Backend Engineer Spec
**Repo:** https://github.com/src-cue/fee-recovery-agent  
**App:** `apps/api/` + `packages/`  
**Stack:** Fastify · TypeScript · Inngest · XState v5 · Supabase · Upstash Redis · Zod

---

## Setup

```bash
cd apps/api
cp .env.example .env
npm install
npm run dev       # http://localhost:3001

# Run Inngest dev server (separate terminal)
npx inngest-cli@latest dev -u http://localhost:3001/api/inngest
```

Required env (see `.env.example` for full list):
```
DATABASE_URL=
SUPABASE_SERVICE_KEY=
UPSTASH_REDIS_URL=
UPSTASH_REDIS_TOKEN=
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# WhatsApp providers
GUPSHUP_API_KEY=
GUPSHUP_APP_NAME=
DIALOG360_API_KEY=
DIALOG360_CHANNEL_ID=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WA_NUMBER=

# Calling providers
EXOTEL_API_KEY=
EXOTEL_API_TOKEN=
EXOTEL_SID=
EXOTEL_CALLER_ID=
PLIVO_AUTH_ID=
PLIVO_AUTH_TOKEN=
PLIVO_NUMBER=

# SMS
MSG91_AUTH_KEY=
MSG91_SENDER_ID=

# NLP
GROQ_API_KEY=
OPENAI_API_KEY=          # fallback

# Transcription
DEEPGRAM_API_KEY=

# App
BASE_URL=https://api.feerecovery.ai
JWT_SECRET=
```

---

## API Endpoints to Build

### Authentication
```
POST /v1/auth/login              body: { email, password }
POST /v1/auth/logout
GET  /v1/auth/me
```

### Tenant / Settings
```
POST /v1/tenants/register        body: TenantCreateSchema
GET  /v1/settings
PUT  /v1/settings
GET  /v1/settings/api-key
POST /v1/settings/api-key/regenerate
GET  /v1/settings/policy-ladder
PUT  /v1/settings/policy-ladder
GET  /v1/settings/channels
PUT  /v1/settings/channels
```

### Cases
```
POST /v1/cases                   body: CaseCreateSchema (single)
POST /v1/cases/bulk              body: { cases: CaseCreateSchema[], dry_run: boolean }
GET  /v1/cases                   query: status, from, to, fee_type, search, page, limit, sort
GET  /v1/cases/export            query: format (csv|xlsx), + same filters → file download
GET  /v1/cases/:id
GET  /v1/cases/:id/timeline
POST /v1/cases/:id/note          body: { text: string }
POST /v1/cases/:id/hold
POST /v1/cases/:id/resolve
POST /v1/cases/:id/escalate
PATCH /v1/cases/:id/override-stage  body: { stage: 'P1'|'P2'|'P3' }
```

### Templates
```
GET  /v1/templates
POST /v1/templates               body: TemplateCreateSchema
PUT  /v1/templates/:id
DELETE /v1/templates/:id
POST /v1/templates/:id/submit-for-approval
GET  /v1/templates/:id/preview   body: { sample_vars }
```

### Dashboard
```
GET /v1/dashboard/summary
GET /v1/dashboard/trend          query: days (default 30)
GET /v1/dashboard/activity       query: limit
GET /v1/dashboard/channel-stats
```

### Billing
```
GET /v1/billing/balance
GET /v1/billing/usage            query: period (e.g. 30d)
```

### Webhooks (inbound from providers)
```
POST /v1/webhooks/whatsapp       ← Gupshup / 360dialog / Twilio WA inbound
POST /v1/webhooks/call-events    ← Exotel / Twilio / Plivo call events
POST /v1/webhooks/call-recording ← Recording ready callback
POST /v1/webhooks/sms-inbound    ← SMS reply inbound

# Inngest internal (do not expose publicly)
POST /api/inngest                ← Inngest worker endpoint
```

---

## Provider Integrations

### WhatsApp — Gupshup (Primary)

```typescript
// packages/providers/src/whatsapp/gupshup.ts

export class GupshupProvider implements WhatsAppProvider {
  name = 'gupshup';
  
  async sendTemplate(to: string, templateName: string, params: string[]): Promise<SendResult> {
    const res = await fetch('https://api.gupshup.io/sm/api/v1/template/msg', {
      method: 'POST',
      headers: {
        'apikey': process.env.GUPSHUP_API_KEY!,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        channel: 'whatsapp',
        source: process.env.GUPSHUP_APP_NAME!,
        destination: to,
        'src.name': process.env.GUPSHUP_APP_NAME!,
        template: JSON.stringify({ id: templateName, params })
      })
    });
    const data = await res.json();
    return { success: res.ok, messageId: data.messageId, raw: data };
  }

  async sendFreeform(to: string, text: string): Promise<SendResult> {
    const res = await fetch('https://api.gupshup.io/sm/api/v1/msg', {
      method: 'POST',
      headers: { 'apikey': process.env.GUPSHUP_API_KEY!, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        channel: 'whatsapp',
        source: process.env.GUPSHUP_APP_NAME!,
        destination: to,
        message: JSON.stringify({ type: 'text', text }),
        'src.name': process.env.GUPSHUP_APP_NAME!,
      })
    });
    const data = await res.json();
    return { success: res.ok, messageId: data.messageId, raw: data };
  }

  // Gupshup sends inbound via webhook POST to /v1/webhooks/whatsapp
  parseInbound(body: unknown): InboundMessage {
    const b = body as GupshupWebhook;
    return {
      from: b.payload.sender.phone,
      text: b.payload.payload.text,
      messageId: b.payload.id,
      timestamp: new Date(b.timestamp),
    };
  }
}
```

### WhatsApp — 360dialog (Secondary)

```typescript
// packages/providers/src/whatsapp/360dialog.ts

export class Dialog360Provider implements WhatsAppProvider {
  name = '360dialog';
  private baseUrl = `https://waba.360dialog.io/v1`;

  async sendTemplate(to: string, templateName: string, params: string[]): Promise<SendResult> {
    const res = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'D360-API-KEY': process.env.DIALOG360_API_KEY!,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to, type: 'template',
        template: {
          namespace: process.env.DIALOG360_CHANNEL_ID,
          name: templateName,
          language: { code: 'en', policy: 'deterministic' },
          components: [{ type: 'body', parameters: params.map(p => ({ type: 'text', text: p })) }]
        }
      })
    });
    const data = await res.json();
    return { success: res.ok, messageId: data.messages?.[0]?.id, raw: data };
  }

  async sendFreeform(to: string, text: string): Promise<SendResult> {
    const res = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: { 'D360-API-KEY': process.env.DIALOG360_API_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, type: 'text', text: { body: text } })
    });
    const data = await res.json();
    return { success: res.ok, messageId: data.messages?.[0]?.id, raw: data };
  }

  parseInbound(body: unknown): InboundMessage {
    const b = body as Dialog360Webhook;
    const msg = b.messages[0];
    return { from: msg.from, text: msg.text?.body ?? '', messageId: msg.id, timestamp: new Date(parseInt(msg.timestamp) * 1000) };
  }
}
```

### WhatsApp — Twilio (Tertiary Fallback)

```typescript
// packages/providers/src/whatsapp/twilio-wa.ts

import twilio from 'twilio';

export class TwilioWAProvider implements WhatsAppProvider {
  name = 'twilio-wa';
  private client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  async sendTemplate(to: string, _templateName: string, params: string[]): Promise<SendResult> {
    // Twilio WA uses content templates via Content API
    const msg = await this.client.messages.create({
      from: `whatsapp:${process.env.TWILIO_WA_NUMBER}`,
      to: `whatsapp:${to}`,
      contentSid: _templateName,  // Twilio content template SID
      contentVariables: JSON.stringify(params.reduce((acc, p, i) => ({ ...acc, [i+1]: p }), {}))
    });
    return { success: true, messageId: msg.sid, raw: msg };
  }

  async sendFreeform(to: string, text: string): Promise<SendResult> {
    const msg = await this.client.messages.create({
      from: `whatsapp:${process.env.TWILIO_WA_NUMBER}`,
      to: `whatsapp:${to}`,
      body: text
    });
    return { success: true, messageId: msg.sid, raw: msg };
  }

  parseInbound(body: unknown): InboundMessage {
    const b = body as Record<string, string>;
    return { from: b.From.replace('whatsapp:', ''), text: b.Body, messageId: b.MessageSid, timestamp: new Date() };
  }
}
```

---

### Calling — Exotel (Primary)

```typescript
// packages/providers/src/calling/exotel.ts

export class ExotelProvider implements CallingProvider {
  name = 'exotel';
  private baseUrl = `https://${process.env.EXOTEL_API_KEY}:${process.env.EXOTEL_API_TOKEN}@api.exotel.com/v1/Accounts/${process.env.EXOTEL_SID}`;

  async dial(to: string, webhookUrl: string, callbackUrl: string): Promise<CallSession> {
    const res = await fetch(`${this.baseUrl}/Calls/connect.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        From: to,
        To: process.env.EXOTEL_CALLER_ID!,
        CallerId: process.env.EXOTEL_CALLER_ID!,
        StatusCallback: callbackUrl,
        StatusCallbackEvents: 'terminal',
        RecordingChannels: 'dual',
        PlayDtmf: '1',
      })
    });
    const data = await res.json();
    return {
      callSid: data.Call.Sid,
      status: data.Call.Status,
      provider: this.name
    };
  }

  parseCallEvent(body: unknown): CallEvent {
    const b = body as Record<string, string>;
    return {
      callSid: b.CallSid,
      status: b.CallStatus,  // 'completed' | 'no-answer' | 'busy' | 'failed'
      duration: parseInt(b.CallDuration ?? '0'),
      recordingUrl: b.RecordingUrl,
    };
  }
}
```

### Calling — Twilio Voice (Fallback 1)

```typescript
// packages/providers/src/calling/twilio.ts

import twilio from 'twilio';

export class TwilioCallingProvider implements CallingProvider {
  name = 'twilio';
  private client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  async dial(to: string, webhookUrl: string, callbackUrl: string): Promise<CallSession> {
    const call = await this.client.calls.create({
      to, from: process.env.TWILIO_NUMBER!,
      url: webhookUrl,          // TwiML webhook for call script
      statusCallback: callbackUrl,
      statusCallbackEvent: ['completed'],
      record: true,
      recordingStatusCallback: `${process.env.BASE_URL}/v1/webhooks/call-recording`,
    });
    return { callSid: call.sid, status: call.status, provider: this.name };
  }

  parseCallEvent(body: unknown): CallEvent {
    const b = body as Record<string, string>;
    return {
      callSid: b.CallSid,
      status: b.CallStatus,
      duration: parseInt(b.CallDuration ?? '0'),
      recordingUrl: b.RecordingUrl,
    };
  }
}
```

### Calling — Plivo (Fallback 2)

```typescript
// packages/providers/src/calling/plivo.ts

import plivo from 'plivo';

export class PlivoProvider implements CallingProvider {
  name = 'plivo';
  private client = new plivo.Client(process.env.PLIVO_AUTH_ID!, process.env.PLIVO_AUTH_TOKEN!);

  async dial(to: string, webhookUrl: string, callbackUrl: string): Promise<CallSession> {
    const res = await this.client.calls.create(
      process.env.PLIVO_NUMBER!,
      to,
      webhookUrl,
      { callbackUrl, record: true, recordingCallbackUrl: `${process.env.BASE_URL}/v1/webhooks/call-recording` }
    );
    return { callSid: res.requestUuid, status: 'initiated', provider: this.name };
  }

  parseCallEvent(body: unknown): CallEvent {
    const b = body as Record<string, string>;
    return {
      callSid: b.CallUUID,
      status: b.Event === 'hangup' ? 'completed' : b.Event,
      duration: parseInt(b.Duration ?? '0'),
      recordingUrl: b.RecordUrl,
    };
  }
}
```

---

## Provider Router

```typescript
// packages/providers/src/router.ts

const WA_PROVIDERS: WhatsAppProvider[] = [
  new GupshupProvider(),
  new Dialog360Provider(),
  new TwilioWAProvider(),
];

const CALLING_PROVIDERS: CallingProvider[] = [
  new ExotelProvider(),
  new TwilioCallingProvider(),
  new PlivoProvider(),
];

export class ProviderRouter {
  async pickWhatsApp(exclude?: string): Promise<WhatsAppProvider> {
    for (const p of WA_PROVIDERS.filter(p => p.name !== exclude)) {
      const h = await this.getHealth(p.name);
      if (h.isHealthy) return p;
    }
    return WA_PROVIDERS[0]; // last resort
  }

  async pickCalling(exclude?: string): Promise<CallingProvider> {
    for (const p of CALLING_PROVIDERS.filter(p => p.name !== exclude)) {
      const h = await this.getHealth(p.name);
      if (h.isHealthy) return p;
    }
    return CALLING_PROVIDERS[0];
  }

  async recordOutcome(provider: string, success: boolean, latencyMs: number) {
    const key = `provider:outcomes:${provider}`;
    await redis.lpush(key, JSON.stringify({ success, latencyMs, ts: Date.now() }));
    await redis.ltrim(key, 0, 99);
    const outcomes = (await redis.lrange(key, 0, 99)).map(o => JSON.parse(o));
    const errorRate = outcomes.filter(o => !o.success).length / outcomes.length;
    await supabase.from('provider_health').upsert({
      provider, is_healthy: errorRate < 0.05, error_rate: errorRate,
      avg_latency: Math.round(outcomes.reduce((s, o) => s + o.latencyMs, 0) / outcomes.length),
      last_check: new Date().toISOString()
    });
  }

  private async getHealth(provider: string) {
    const { data } = await supabase.from('provider_health').select().eq('provider', provider).single();
    return { isHealthy: data?.is_healthy ?? true };
  }
}
```

---

## Intent Classifier (NLP)

```typescript
// packages/nlp/src/classifier.ts

import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `You classify parent replies to fee reminder messages from schools.
Return ONLY valid JSON: { "intent": "paid|promise|dispute|distress|no_intent", "promise_date": "YYYY-MM-DD or null", "sentiment": 1-5, "language": "en|hi|ta|te|mr|kn|bn" }
Rules:
- paid: parent says they paid, payment done, sent money
- promise: parent gives a specific date, "will pay by X", "pay tomorrow"  
- dispute: questions the amount, says fee is wrong, demands breakdown
- distress: expresses financial hardship, stress, fear, asks for help
- no_intent: anything else (ok, thanks, seen, etc.)
Sentiment: 1=very negative, 3=neutral, 5=very positive`;

export async function classifyIntent(message: string): Promise<IntentResult> {
  try {
    const res = await groq.chat.completions.create({
      model: 'llama-3.1-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message }
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    });
    return JSON.parse(res.choices[0].message.content!) as IntentResult;
  } catch {
    // Fallback to OpenAI if Groq fails
    return classifyWithOpenAI(message);
  }
}
```

---

## Bulk Upload API

```typescript
// apps/api/src/routes/cases.ts — bulk endpoint

fastify.post('/v1/cases/bulk', { preHandler: [requireAuth] }, async (req, reply) => {
  const { cases, dry_run = false } = req.body as BulkUploadBody;
  const tenant = req.tenant;

  // Validate all rows first
  const results = cases.map((c, i) => {
    const parsed = CaseCreateSchema.safeParse(c);
    return {
      row: i + 1,
      valid: parsed.success,
      errors: parsed.success ? [] : parsed.error.issues.map(e => e.message),
      data: parsed.success ? parsed.data : null,
    };
  });

  const validRows = results.filter(r => r.valid);
  const invalidRows = results.filter(r => !r.valid);

  if (dry_run) {
    return reply.send({ valid_count: validRows.length, invalid_count: invalidRows.length, errors: invalidRows });
  }

  // Check token balance
  const tokensNeeded = validRows.length * 1; // 1 token to open a case
  if (tenant.token_balance < tokensNeeded) {
    return reply.code(402).send({ error: `Need ${tokensNeeded} tokens, have ${tenant.token_balance}` });
  }

  // Insert valid rows in batches of 50
  const inserted = [];
  for (const chunk of chunkArray(validRows, 50)) {
    const rows = await supabase.from('cases').insert(
      chunk.map(r => ({ ...r.data, tenant_id: tenant.id }))
    ).select();
    inserted.push(...(rows.data ?? []));

    // Enqueue each case
    await inngest.send(inserted.map(c => ({ name: 'case/created', data: { case_id: c.id, tenant_id: tenant.id } })));
  }

  return reply.send({
    inserted: inserted.length,
    skipped: invalidRows.length,
    errors: invalidRows,
    platform_case_ids: inserted.map(c => c.id),
  });
});
```

---

## Idempotency Middleware

```typescript
// apps/api/src/plugins/idempotency.ts

fastify.addHook('preHandler', async (req, reply) => {
  const key = req.headers['idempotency-key'] as string;
  if (!key || req.method !== 'POST') return;

  const cached = await redis.get(`idempotency:${key}`);
  if (cached) {
    const { status, body } = JSON.parse(cached);
    reply.code(status).send(body);
    return reply;
  }

  // Attach to request so route handler can cache its response
  req.idempotencyKey = key;
});

// In route handlers, after building response:
if (req.idempotencyKey) {
  await redis.set(`idempotency:${req.idempotencyKey}`,
    JSON.stringify({ status: 200, body: responseData }), 'EX', 86400);
}
```

---

## Acceptance Criteria

- [ ] All API endpoints return correct status codes (200/201/400/401/402/404/409/500)
- [ ] Webhook endpoints return `200 OK` within 200ms (before processing)
- [ ] WA inbound webhook correctly deduplicates duplicate messages from provider
- [ ] Provider router falls over to secondary within 30s of primary error rate > 5%
- [ ] Bulk upload: 500 rows processes without timeout (use streaming response or background job)
- [ ] Intent classifier falls back to OpenAI if Groq fails
- [ ] Every state transition is atomic (no partial writes)
- [ ] All routes protected by `requireAuth` middleware except `/v1/webhooks/*`
- [ ] TRAI DND check runs before every outbound SMS/call
- [ ] Token balance checked and deducted atomically (no race condition)
