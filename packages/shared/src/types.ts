export type CaseStatus = 'ACTIVE' | 'RESOLVED' | 'ESCALATED' | 'HOLD';
export type CaseStage = 'P1' | 'P2' | 'P3' | 'P4';
export type Channel = 'whatsapp' | 'call' | 'sms' | 'email';
export type Language = 'en' | 'hi' | 'ta' | 'te' | 'mr' | 'kn' | 'bn';
export type Intent = 'paid' | 'promise' | 'dispute' | 'distress' | 'no_intent';

export interface Tenant {
  id: string;
  school_name: string;
  email: string;
  timezone: string;
  currency: string;
  default_language: Language;
  callback_url: string | null;
  erp_type: string;
  token_balance: number;
  api_key: string;
  webhook_secret: string;
  created_at: string;
}

export interface Case {
  id: string;
  tenant_id: string;
  case_id: string;
  student_name: string | null;
  parent_name: string | null;
  parent_phone: string;
  parent_email: string | null;
  fee_amount: number;
  currency: string;
  due_date: string;
  days_overdue: number;
  fee_type: string;
  payment_link: string | null;
  notes: string | null;
  language: Language;
  status: CaseStatus;
  current_stage: CaseStage | null;
  metadata: Record<string, unknown> | null;
  last_action_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimelineEvent {
  id: string;
  case_id: string;
  tenant_id: string;
  type: 'outbound_message' | 'inbound_reply' | 'call' | 'note' | 'status_change' | 'stage_change';
  channel: Channel | null;
  direction: 'outbound' | 'inbound' | null;
  content: string | null;
  intent: Intent | null;
  sentiment: number | null;
  provider: string | null;
  message_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface Template {
  id: string;
  tenant_id: string;
  name: string;
  channel: Channel;
  stage: CaseStage | 'custom';
  language: Language;
  body: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected';
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
}

export interface SendResult {
  success: boolean;
  messageId: string | null;
  raw: unknown;
}

export interface InboundMessage {
  from: string;
  text: string;
  messageId: string;
  timestamp: Date;
}

export interface CallSession {
  callSid: string;
  status: string;
  provider: string;
}

export interface CallEvent {
  callSid: string;
  status: string;
  duration: number;
  recordingUrl: string | undefined;
}

export interface IntentResult {
  intent: Intent;
  promise_date: string | null;
  sentiment: number;
  language: Language;
}

export interface CaseStatusEvent {
  erp_case_id: string;
  new_status: string;
  notes: string | null;
  promise_date: string | null;
  timestamp: string;
}

export interface ProviderHealth {
  provider: string;
  is_healthy: boolean;
  error_rate: number;
  avg_latency: number;
  last_check: string;
}
