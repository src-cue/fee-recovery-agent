# DevOps Engineer Spec
**Repo:** https://github.com/src-cue/fee-recovery-agent  
**Stack:** GitHub Actions · Vercel (web) · Railway (api) · Supabase · Upstash Redis · Docker · Sentry

---

## Environments

| Env | Branch | Purpose |
|-----|--------|---------|
| `local` | any | Developer machines via docker-compose |
| `staging` | `staging` | Pre-production. Auto-deploy on push. |
| `production` | `main` | Live. Deploy only via tagged release. |

---

## Local Dev Stack

Create `docker/docker-compose.yml`:

```yaml
version: '3.8'
services:
  api:
    build: ../apps/api
    ports: ["3001:3001"]
    env_file: ../apps/api/.env
    depends_on: [redis]
    volumes:
      - ../apps/api:/app
      - /app/node_modules

  web:
    build: ../apps/web
    ports: ["3000:3000"]
    env_file: ../apps/web/.env.local
    depends_on: [api]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  inngest:
    image: inngest/inngest:latest
    ports: ["8288:8288"]
    command: ["inngest", "dev", "-u", "http://api:3001/api/inngest"]
    depends_on: [api]
```

**Devs run:** `docker compose -f docker/docker-compose.yml up`  
Supabase runs cloud (use staging project for local dev, not production).

---

## Infrastructure

### API — Railway

```toml
# railway.toml (apps/api/)
[build]
  builder = "NIXPACKS"
  buildCommand = "npm run build"

[deploy]
  startCommand = "npm run start"
  healthcheckPath = "/health"
  healthcheckTimeout = 30
  restartPolicyType = "ON_FAILURE"
  restartPolicyMaxRetries = 3

[[services]]
  name = "api"
  source = "apps/api"
```

Railway environment variables — set via Railway dashboard (never in repo):
- All vars from `apps/api/.env.example`
- `NODE_ENV=production`
- `PORT=3001`

### Web — Vercel

```json
// vercel.json (apps/web/)
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "regions": ["bom1"],
  "env": {
    "NEXT_PUBLIC_API_URL": "@api_url_production"
  }
}
```

Vercel environment variables — set via Vercel dashboard:
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Supabase

- One project per environment: `fee-recovery-staging`, `fee-recovery-prod`
- Enable Row Level Security on all tables (see `supabase/migrations/`)
- Set up Supabase Realtime for `cases` table (for live dashboard updates)
- Backups: enable Point-in-Time Recovery on production

### Upstash Redis

- One database per environment
- Set `UPSTASH_REDIS_URL` and `UPSTASH_REDIS_TOKEN` per environment
- Enable eviction policy: `allkeys-lru`
- Set max memory: 256MB for staging, 1GB for production

---

## CI/CD Pipelines

### `.github/workflows/ci.yml` — Runs on every PR

```yaml
name: CI

on:
  pull_request:
    branches: [dev, staging, main]

jobs:
  lint-and-type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check

  test:
    runs-on: ubuntu-latest
    services:
      redis:
        image: redis:7-alpine
        ports: ['6379:6379']
    env:
      DATABASE_URL: ${{ secrets.STAGING_DATABASE_URL }}
      UPSTASH_REDIS_URL: redis://localhost:6379
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run test
      - run: npm run test:integration

  build:
    runs-on: ubuntu-latest
    needs: [lint-and-type-check, test]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run build
```

### `.github/workflows/deploy-staging.yml` — Runs on push to `staging`

```yaml
name: Deploy Staging

on:
  push:
    branches: [staging]

jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - run: supabase db push --db-url ${{ secrets.STAGING_DATABASE_URL }}

  deploy-api:
    needs: migrate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: bervProject/railway-deploy@main
        with:
          railway_token: ${{ secrets.RAILWAY_TOKEN_STAGING }}
          service: api

  deploy-web:
    needs: migrate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID_STAGING }}
```

### `.github/workflows/deploy-production.yml` — Runs on release tag `v*`

```yaml
name: Deploy Production

on:
  push:
    tags: ['v*']

jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - run: supabase db push --db-url ${{ secrets.PROD_DATABASE_URL }}

  deploy-api:
    needs: migrate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: bervProject/railway-deploy@main
        with:
          railway_token: ${{ secrets.RAILWAY_TOKEN_PROD }}
          service: api

  deploy-web:
    needs: migrate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID_PROD }}
          vercel-args: '--prod'

  notify:
    needs: [deploy-api, deploy-web]
    runs-on: ubuntu-latest
    steps:
      - name: Notify Slack
        run: |
          curl -X POST ${{ secrets.SLACK_WEBHOOK }} \
            -d '{"text":"✅ Production deploy complete: ${{ github.ref_name }}"}'
```

---

## Database Migrations

```bash
# Create a new migration
supabase migration new add_template_approval_status

# Apply all pending migrations to staging
supabase db push --db-url $STAGING_DATABASE_URL

# Apply to production (run manually before deploy, never in automation without review)
supabase db push --db-url $PROD_DATABASE_URL
```

Migration files go in `supabase/migrations/` with format `YYYYMMDDHHMMSS_description.sql`.  
**Never edit existing migration files.** Always create a new migration to alter schema.

---

## Health Check Endpoint

```typescript
// apps/api/src/routes/health.ts
fastify.get('/health', async (req, reply) => {
  const checks = await Promise.allSettled([
    supabase.from('tenants').select('id').limit(1),  // DB check
    redis.ping(),                                      // Redis check
  ]);
  const [db, cache] = checks;
  const healthy = checks.every(c => c.status === 'fulfilled');
  return reply.code(healthy ? 200 : 503).send({
    status: healthy ? 'ok' : 'degraded',
    db: db.status === 'fulfilled' ? 'ok' : 'error',
    cache: cache.status === 'fulfilled' ? 'ok' : 'error',
    version: process.env.npm_package_version,
  });
});
```

Railway and Vercel both call `/health` every 30s. Alert if it returns non-200 for 2 consecutive checks.

---

## Monitoring

### Sentry Setup (both api and web)

```typescript
// apps/api/src/app.ts
import * as Sentry from '@sentry/node';
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  integrations: [new Sentry.Integrations.Http({ tracing: true })],
});
```

Tag every Sentry error with `tenant_id` (never raw phone/email):
```typescript
Sentry.setTag('tenant_id', req.tenant?.id);
```

### Alerts to Configure

| Alert | Condition | Channel |
|-------|-----------|---------|
| API error rate | > 1% 5xx in 5 min | Slack #alerts |
| Health check failing | 2 consecutive fails | Slack #alerts + email |
| Provider error rate | Gupshup/Exotel > 5% | Slack #alerts |
| Token balance critical | Any tenant < 50 tokens | Email to tenant + Slack |
| DB connection pool | > 80% utilisation | Slack #alerts |
| Redis memory | > 80% | Slack #alerts |

---

## GitHub Secrets to Configure

```
# Supabase
STAGING_DATABASE_URL
PROD_DATABASE_URL
SUPABASE_PROJECT_REF_STAGING
SUPABASE_PROJECT_REF_PROD
SUPABASE_SERVICE_KEY_STAGING
SUPABASE_SERVICE_KEY_PROD

# Railway
RAILWAY_TOKEN_STAGING
RAILWAY_TOKEN_PROD

# Vercel
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID_STAGING
VERCEL_PROJECT_ID_PROD

# Notifications
SLACK_WEBHOOK

# Providers (staging)
GUPSHUP_API_KEY_STAGING
EXOTEL_API_KEY_STAGING
# ... (one secret per provider per environment)
```

---

## Acceptance Criteria

- [ ] `docker compose up` starts full local stack in < 2 minutes
- [ ] CI passes on every PR before merge is possible (branch protection rules set)
- [ ] Staging auto-deploys on push to `staging` branch
- [ ] Production deploys only via tagged release (`v1.0.0` format)
- [ ] Database migrations run automatically before API deploy in both environments
- [ ] `/health` endpoint responds < 500ms and returns correct degraded status if DB/Redis is down
- [ ] Sentry captures errors in both api and web with tenant_id tag
- [ ] All secrets in GitHub Secrets — zero secrets in repo files
- [ ] Railway auto-restarts API on crash (max 3 retries, then alerts)
- [ ] Vercel preview deploys on every PR to `dev` (for FE review)
