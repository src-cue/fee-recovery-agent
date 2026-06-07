-- Tenants (one per school)
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  currency TEXT NOT NULL DEFAULT 'INR',
  default_language TEXT NOT NULL DEFAULT 'en',
  callback_url TEXT,
  erp_type TEXT NOT NULL DEFAULT 'api',
  token_balance INTEGER NOT NULL DEFAULT 0,
  api_key TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  webhook_secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  policy_ladder JSONB,
  channel_settings JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cases (one per overdue student fee)
CREATE TABLE cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  case_id TEXT NOT NULL,
  student_name TEXT,
  parent_name TEXT,
  parent_phone TEXT NOT NULL,
  parent_email TEXT,
  fee_amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  due_date DATE NOT NULL,
  days_overdue INTEGER NOT NULL DEFAULT 0,
  fee_type TEXT NOT NULL DEFAULT 'Tuition Fee',
  payment_link TEXT,
  notes TEXT,
  language TEXT NOT NULL DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RESOLVED','ESCALATED','HOLD')),
  current_stage TEXT CHECK (current_stage IN ('P1','P2','P3','P4')),
  metadata JSONB,
  last_action_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, case_id)
);
CREATE INDEX cases_tenant_status ON cases(tenant_id, status);
CREATE INDEX cases_tenant_created ON cases(tenant_id, created_at DESC);

-- Timeline events
CREATE TABLE timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  channel TEXT,
  direction TEXT CHECK (direction IN ('outbound','inbound')),
  content TEXT,
  intent TEXT,
  sentiment INTEGER CHECK (sentiment BETWEEN 1 AND 5),
  provider TEXT,
  message_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX timeline_case_id ON timeline_events(case_id, created_at DESC);
CREATE UNIQUE INDEX timeline_dedup ON timeline_events(message_id) WHERE message_id IS NOT NULL;

-- Templates
CREATE TABLE templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp','sms','email')),
  stage TEXT NOT NULL CHECK (stage IN ('P1','P2','P3','custom')),
  language TEXT NOT NULL DEFAULT 'en',
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','approved','rejected')),
  is_builtin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Provider health tracking
CREATE TABLE provider_health (
  provider TEXT PRIMARY KEY,
  is_healthy BOOLEAN NOT NULL DEFAULT true,
  error_rate NUMERIC(5,4) NOT NULL DEFAULT 0,
  avg_latency INTEGER NOT NULL DEFAULT 0,
  last_check TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Billing / token usage log
CREATE TABLE token_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  case_id UUID REFERENCES cases(id),
  action TEXT NOT NULL,
  tokens INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX token_usage_tenant ON token_usage(tenant_id, created_at DESC);

-- Row Level Security
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_usage ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (used by backend)
CREATE POLICY "service_all" ON tenants TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON cases TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON timeline_events TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON templates TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON token_usage TO service_role USING (true) WITH CHECK (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tenants_updated_at BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER cases_updated_at BEFORE UPDATE ON cases FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER templates_updated_at BEFORE UPDATE ON templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();
