import { z } from 'zod';

export const CaseCreateSchema = z.object({
  case_id: z.string().min(1),
  student_name: z.string().optional(),
  parent_name: z.string().optional(),
  parent_phone: z
    .string()
    .regex(/^\+?[0-9]{10,13}$/, 'Invalid phone format')
    .transform((v) => v.replace(/\s/g, '')),
  parent_email: z.string().email().optional(),
  fee_amount: z.number().positive(),
  currency: z.string().default('INR'),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  days_overdue: z.number().int().min(0).default(0),
  fee_type: z.string().default('Tuition Fee'),
  payment_link: z.string().url().optional(),
  notes: z.string().optional(),
  language: z.enum(['en', 'hi', 'ta', 'te', 'mr', 'kn', 'bn']).default('en'),
  metadata: z.record(z.unknown()).optional(),
});
export type CaseCreate = z.infer<typeof CaseCreateSchema>;

export const TenantCreateSchema = z.object({
  school_name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().optional(),
  timezone: z.string().default('Asia/Kolkata'),
  currency: z.string().default('INR'),
  default_language: z.enum(['en', 'hi', 'ta', 'te', 'mr', 'kn', 'bn']).default('en'),
  callback_url: z.string().url().optional(),
  erp_type: z.enum(['fedena', 'entab', 'classter', 'csv', 'api']).default('api'),
});
export type TenantCreate = z.infer<typeof TenantCreateSchema>;

export const TemplateCreateSchema = z.object({
  name: z.string().min(1),
  channel: z.enum(['whatsapp', 'sms', 'email']),
  stage: z.enum(['P1', 'P2', 'P3', 'custom']),
  language: z.enum(['en', 'hi', 'ta', 'te', 'mr', 'kn', 'bn']),
  body: z.string().min(1),
});
export type TemplateCreate = z.infer<typeof TemplateCreateSchema>;

export const PolicyLadderSchema = z.object({
  stages: z.array(
    z.object({
      stage: z.enum(['P1', 'P2', 'P3', 'P4']),
      day_trigger: z.number().int().min(0),
      channel: z.enum(['whatsapp', 'call', 'sms']),
      template_id: z.string().uuid().optional(),
      enabled: z.boolean().default(true),
    })
  ),
  daily_cap: z.number().int().min(1).max(3).default(1),
  blackout_start: z.string().regex(/^\d{2}:\d{2}$/).default('21:00'),
  blackout_end: z.string().regex(/^\d{2}:\d{2}$/).default('08:00'),
  test_mode: z.boolean().default(false),
  test_phone: z.string().optional(),
});

export const BulkUploadBodySchema = z.object({
  cases: z.array(CaseCreateSchema),
  dry_run: z.boolean().default(false),
});

export const CaseListQuerySchema = z.object({
  status: z.enum(['ACTIVE', 'RESOLVED', 'ESCALATED', 'HOLD']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  fee_type: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().default('days_overdue:desc'),
});

export const OverrideStageSchema = z.object({
  stage: z.enum(['P1', 'P2', 'P3']),
});
