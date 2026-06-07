# Fee Recovery Agent

An AI-powered fee recovery automation platform for schools. Sits between school ERPs and communication providers — WhatsApp, AI voice calls, SMS — to automate the full overdue fee collection workflow with zero manual effort.

**Repo:** https://github.com/src-cue/fee-recovery-agent  
**Stack:** Next.js 14 · Fastify · Inngest · Supabase · TypeScript (Turborepo monorepo)

---

## What It Does

1. School uploads overdue fee cases (CSV/Excel or API)
2. System automatically sends WhatsApp reminders → AI phone calls → SMS in a configurable ladder
3. AI scores every case by priority (days overdue + amount + response history)
4. Staff see a ranked Call Queue — click to dial, AI agent speaks to the parent
5. Parent responses (WhatsApp replies, call keypresses) are classified by AI and case status updates automatically
6. When a case is resolved, the workflow cancels — no more messages

---

## Project Structure

```
fee-recovery-agent/
├── apps/
│   ├── api/                        ← Fastify REST API (port 3001)
│   │   └── src/
│   │       ├── functions/          ← Inngest durable workflow functions
│   │       │   ├── case-created.ts     ← Multi-stage reminder ladder
│   │       │   ├── message-inbound.ts  ← Inbound reply → intent → status
│   │       │   └── call-completed.ts   ← Post-call transcript → status
│   │       ├── lib/
│   │       │   ├── inngest.ts          ← Inngest client
│   │       │   └── ai-priority.ts      ← Groq case scoring (0-100)
│   │       ├── plugins/            ← Auth, error handler, idempotency
│   │       └── routes/             ← All HTTP route handlers
│   └── web/                        ← Next.js 14 frontend (port 3000)
│       └── src/
│           ├── app/
│           │   ├── (auth)/             ← Login, Signup pages
│           │   └── (dashboard)/        ← All protected pages
│           │       ├── page.tsx            ← Dashboard KPIs + chart
│           │       ├── call-queue/         ← AI-ranked call queue
│           │       ├── students/           ← Case list + detail + upload
│           │       ├── templates/          ← Message template CRUD
│           │       ├── reminders/          ← Policy ladder config
│           │       └── settings/           ← Provider + billing settings
│           ├── components/layout/      ← Sidebar with nav + sign out
│           ├── lib/
│           │   ├── api.ts              ← Typed fetch wrapper
│           │   ├── auth.ts             ← Token helpers (cookie + localStorage)
│           │   └── utils.ts            ← cn(), formatCurrency(), etc.
│           └── middleware.ts           ← Route guard (redirects to /login)
├── packages/
│   ├── shared/                     ← Zod schemas, TypeScript types, utils
│   ├── db/                         ← Supabase client (service role)
│   ├── nlp/                        ← Groq intent classifier (paid/promise/distress)
│   └── providers/                  ← Multi-provider adapters with failover
│       ├── whatsapp/               ← Gupshup, 360dialog, Twilio WA
│       ├── calling/                ← Exotel, Twilio Voice, Plivo
│       └── sms/                    ← MSG91, Twilio SMS
└── supabase/
    └── migrations/                 ← Idempotent SQL migrations
```

---

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/auth/login` | Sign in, returns JWT |
| GET | `/v1/auth/me` | Current tenant |
| POST | `/v1/tenants/register` | Create school account |
| GET | `/v1/cases` | List cases (paginated, filterable) |
| POST | `/v1/cases` | Create single case |
| POST | `/v1/cases/bulk` | Bulk upload (dry-run supported) |
| GET | `/v1/cases/:id` | Case detail + timeline |
| POST | `/v1/cases/:id/hold` | Put on hold |
| POST | `/v1/cases/:id/resolve` | Mark resolved |
| POST | `/v1/cases/:id/escalate` | Escalate |
| GET | `/v1/call-queue` | AI-ranked active cases |
| POST | `/v1/call-queue/:id/dial` | Trigger outbound AI call |
| PATCH | `/v1/call-queue/:id/status` | Update status + cancel workflow |
| GET | `/v1/dashboard` | KPIs, chart data, activity feed |
| GET/POST/PUT | `/v1/templates` | Message template CRUD |
| GET/PUT | `/v1/settings` | Tenant settings |
| POST | `/v1/webhooks/whatsapp` | Inbound WhatsApp webhook |
| POST | `/v1/webhooks/call-twiml` | Twilio TwiML — AI voice script |
| POST | `/v1/webhooks/call-input` | Twilio keypress handler |
| POST | `/v1/webhooks/call-events` | Call status callback |
| GET/POST | `/api/inngest` | Inngest function registration |

---

## Inngest Workflows

### `case-created`
Triggered when a new case is created. Runs the full reminder ladder:
- **P1 (Day 1):** WhatsApp message
- **P2 (Day 5):** WhatsApp follow-up
- **P3 (Day 10):** AI phone call
- **P4 (Day 15):** SMS

Each stage re-checks case status before sending. `cancelOn: case/cancelled` — marking a case as Resolved/Hold/Escalated fires the cancel event and stops all pending stages immediately.

### `message-inbound`
Triggered on every incoming WhatsApp or SMS reply:
- Classifies intent via Groq (paid / promise / dispute / distress / no_intent)
- Auto-resolves if parent says they paid
- Auto-escalates if parent expresses distress
- Records promise-to-pay date if detected
- Fires ERP callback webhook if configured

### `call-completed`
Triggered when a call ends:
- Transcribes recording via Groq Whisper
- Classifies intent from transcript
- Updates case status (resolved / escalated / promise)
- Increments `call_attempts` counter

---

## AI Features

### Intent Classification (`packages/nlp`)
Uses **Groq Llama 3.1 70B** (falls back to GPT-4o-mini) to classify parent messages:
- `paid` → auto-resolve case
- `promise` → extract date, add note
- `dispute` → flag for review
- `distress` → auto-escalate, stop messages
- `no_intent` → continue ladder

### AI Voice Calls (`/v1/webhooks/call-twiml`)
When Twilio calls a parent, this endpoint:
1. Fetches case details from DB
2. Uses Groq to generate a personalized, empathetic 60-word script
3. Returns TwiML with **Polly.Aditi** (Indian English voice)
4. Handles keypress: 1 = payment confirmed, 2 = transfer to office

### Priority Scoring (`apps/api/src/lib/ai-priority.ts`)
Groq scores every active case 0–100 for call priority:
- Days overdue (up to 40pts)
- Amount due (up to 30pts)
- Never been called (+15pts)
- Promise to pay pending (+10pts)
- Distress flagged (−20pts)

Fallback: formula scoring if Groq is unavailable. Batch processes 20 cases at a time.

---

## Database Schema (Supabase)

### `tenants`
School accounts. Stores policy ladder config, channel settings, token balance, ERP callback URL.

### `cases`
One row per overdue student. Key fields:
- `status`: `ACTIVE | RESOLVED | ON_HOLD | ESCALATED | PROMISE_TO_PAY`
- `current_stage`: Last reminder stage sent (P1–P4)
- `priority_score`: AI score 0–100
- `call_attempts`: Number of calls made
- `days_overdue`, `fee_amount`, `fee_type`, `payment_link`

### `timeline_events`
Append-only log of every action on a case:
- Outbound messages, inbound replies, calls, status changes, notes
- Stores `intent`, `sentiment`, `recording_url`, `transcript`

### `templates`
Message templates per stage and language. Supports variable interpolation: `{{student_name}}`, `{{amount}}`, `{{due_date}}`, etc.

---

## Local Development

### Prerequisites
- Node.js 18+
- [Supabase account](https://supabase.com) (free tier works)
- [Upstash Redis](https://upstash.com) (free tier works)
- [Groq API key](https://console.groq.com) (free tier works)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
# Fill in SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY,
# UPSTASH_REDIS_URL, UPSTASH_REDIS_TOKEN, GROQ_API_KEY, JWT_SECRET

# 3. Run Supabase migrations
# Open https://supabase.com/dashboard/project/<your-project>/sql/new
# Run files in supabase/migrations/ in order

# 4. Start all services
npm run dev              # API (port 3001) + Web (port 3000)
npx inngest-cli@latest dev -u http://localhost:3001/api/inngest  # Inngest (port 8288)
```

### Create your first tenant

```bash
curl -X POST http://localhost:3001/v1/tenants/register \
  -H "Content-Type: application/json" \
  -d '{
    "school_name": "My School",
    "email": "admin@myschool.com",
    "password": "password123"
  }'
```

Then open [http://localhost:3000/login](http://localhost:3000/login) and sign in.

### Seed a test case

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@myschool.com","password":"password123"}' \
  | jq -r '.token')

curl -X POST http://localhost:3001/v1/cases \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "case_id": "CASE-001",
    "student_name": "Aryan Kumar",
    "parent_name": "Raj Kumar",
    "parent_phone": "+919876543210",
    "fee_amount": 15000,
    "days_overdue": 37,
    "fee_type": "Tuition Fee",
    "due_date": "2026-04-01"
  }'
```

---

## Provider Setup

Configure at least one provider per channel in `apps/api/.env`:

### WhatsApp (choose one)
| Provider | Env vars | Free tier |
|---|---|---|
| Gupshup | `GUPSHUP_API_KEY`, `GUPSHUP_APP_NAME` | Trial credits |
| 360dialog | `DIALOG360_API_KEY`, `DIALOG360_CHANNEL_ID` | Paid |
| Twilio WA | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WA_NUMBER` | $15 trial credit |

### Calling (choose one)
| Provider | Env vars | Free tier |
|---|---|---|
| Exotel | `EXOTEL_API_KEY`, `EXOTEL_API_TOKEN`, `EXOTEL_SID`, `EXOTEL_CALLER_ID` | Trial |
| Twilio Voice | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_NUMBER` | $15 trial credit |
| Plivo | `PLIVO_AUTH_ID`, `PLIVO_AUTH_TOKEN`, `PLIVO_NUMBER` | Trial credits |

### SMS (choose one)
| Provider | Env vars | Free tier |
|---|---|---|
| MSG91 | `MSG91_AUTH_KEY`, `MSG91_SENDER_ID` | 100 free SMS |
| Twilio SMS | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_NUMBER` | $15 trial credit |

The provider router automatically picks a healthy provider and falls back on failure.

---

## Build Status

| Feature | Status |
|---|---|
| Auth (login / signup / route guard) | ✅ Done |
| Student case management (CRUD, bulk upload, export) | ✅ Done |
| Automated reminder ladder (WhatsApp → Call → SMS) | ✅ Done |
| Message templates with variable interpolation | ✅ Done |
| AI intent classification (Groq Llama 3.1) | ✅ Done |
| AI voice calls — Groq-generated TwiML script | ✅ Done |
| Post-call transcript + intent + auto status | ✅ Done |
| AI priority scoring — ranked call queue | ✅ Done |
| Call Queue UI — one-click dial, status controls | ✅ Done |
| Inngest workflow cancellation on case close | ✅ Done |
| Multi-provider failover routing | ✅ Done |
| ERP callback webhooks | ✅ Done |
| Dashboard KPIs + chart | ✅ Done |
| Provider credentials config | ⏳ Pending |
| Student detail page — full timeline | ⏳ In progress |
| Settings page — provider config UI | ⏳ Pending |

---

## Spec Files

| File | For |
|------|-----|
| [specs/FRONTEND.md](./specs/FRONTEND.md) | Frontend engineer |
| [specs/BACKEND.md](./specs/BACKEND.md) | Backend engineer |
| [specs/DEVOPS.md](./specs/DEVOPS.md) | DevOps engineer |
| [specs/FORWARD-DEPLOYMENT.md](./specs/FORWARD-DEPLOYMENT.md) | Integrations engineer |
