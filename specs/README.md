# Fee Recovery Agent — Project Spec

**Repo:** https://github.com/src-cue/fee-recovery-agent  
**Status:** Active Development  
**Stack:** Next.js 14 · Fastify · Inngest · Supabase · XState · TypeScript (monorepo)

---

## What We're Building

An inter-operator AI orchestration platform that sits between school ERPs (Fedena, Entab, Classter) and communication providers (WhatsApp BSPs, calling APIs, SMS gateways). Schools connect once via webhook or CSV upload. The platform handles automated fee recovery — WhatsApp messages, phone calls, SMS — and writes back status + case notes to the ERP automatically.

**Not a marketing tool. Not a CRM. A recovery automation engine with a formal state machine.**

---

## Repo Structure

```
fee-recovery-agent/
├── apps/
│   ├── web/                    ← Next.js 14 frontend (FE engineer)
│   └── api/                    ← Fastify backend (BE engineer)
├── packages/
│   ├── inngest/                ← Durable workflow functions
│   ├── state-machine/          ← XState case FSM
│   ├── providers/              ← WA / calling / SMS adapters
│   │   ├── whatsapp/
│   │   │   ├── gupshup.ts      ← Primary
│   │   │   ├── 360dialog.ts    ← Secondary
│   │   │   └── twilio-wa.ts    ← Tertiary fallback
│   │   ├── calling/
│   │   │   ├── exotel.ts       ← Primary (India)
│   │   │   ├── twilio.ts       ← Fallback 1
│   │   │   └── plivo.ts        ← Fallback 2
│   │   └── sms/
│   │       ├── msg91.ts        ← Primary
│   │       └── twilio-sms.ts   ← Fallback
│   ├── db/                     ← Supabase client + typed queries
│   ├── nlp/                    ← Groq intent classifier
│   └── shared/                 ← Shared types, constants, utils
├── supabase/
│   ├── migrations/             ← SQL migration files
│   └── seed/                   ← Dev seed data
├── specs/
│   ├── README.md               ← This file
│   ├── FRONTEND.md
│   ├── BACKEND.md
│   ├── DEVOPS.md
│   └── FORWARD-DEPLOYMENT.md
├── .github/
│   └── workflows/              ← CI/CD pipelines
├── docker/
│   └── docker-compose.yml      ← Local dev stack
└── docs/
    └── api/                    ← OpenAPI / Postman collections
```

---

## Integrations

### WhatsApp / Messaging
| Provider | Role | Env Prefix |
|----------|------|-----------|
| Gupshup | Primary | `GUPSHUP_` |
| 360dialog | Secondary | `DIALOG360_` |
| Twilio WA | Tertiary fallback | `TWILIO_` |

### Calling
| Provider | Role | Env Prefix |
|----------|------|-----------|
| Exotel | Primary (India) | `EXOTEL_` |
| Twilio Voice | Fallback 1 | `TWILIO_` |
| Plivo | Fallback 2 | `PLIVO_` |

### SMS
| Provider | Role | Env Prefix |
|----------|------|-----------|
| MSG91 | Primary | `MSG91_` |
| Twilio SMS | Fallback | `TWILIO_` |

### Other
| Service | Purpose |
|---------|---------|
| Deepgram Nova-2 | Call transcription |
| Groq (Llama 3.1 70B) | Intent classification |
| Supabase | Database + Auth + Realtime |
| Upstash Redis | Rate limiting + idempotency |
| Inngest | Durable workflow orchestration |
| Sentry | Error monitoring |

---

## Key Features (MVP Scope)

1. **Student list management** — add, edit, bulk upload CSV/Excel, export
2. **Automated reminders** — policy ladder (Day 1/5/10/15), configurable per tenant
3. **Message templates** — built-in set + custom template builder with variables
4. **Multi-channel outreach** — WhatsApp (primary) → Call (fallback) → SMS (last resort)
5. **Provider failover** — automatic routing to healthy provider
6. **Case notes** — add manual notes per student, visible in timeline
7. **ERP callbacks** — status + notes pushed back to school's system
8. **Dashboard** — recovery rate, active cases, token balance, sentiment trends

---

## Environment Variables

See `apps/api/.env.example` and `apps/web/.env.example` for full list.  
Never commit `.env` files. Use GitHub Secrets for CI/CD.

---

## Branch Strategy

```
main          ← production
staging       ← pre-production, auto-deploys to staging env
dev           ← integration branch
feature/*     ← feature branches (PR into dev)
hotfix/*      ← hotfix branches (PR into main + dev)
```

All PRs require one reviewer approval + passing CI before merge.

---

## Spec Files

| File | For |
|------|-----|
| [FRONTEND.md](./FRONTEND.md) | Frontend engineer |
| [BACKEND.md](./BACKEND.md) | Backend engineer |
| [DEVOPS.md](./DEVOPS.md) | DevOps engineer |
| [FORWARD-DEPLOYMENT.md](./FORWARD-DEPLOYMENT.md) | Forward deployment / integrations engineer |
