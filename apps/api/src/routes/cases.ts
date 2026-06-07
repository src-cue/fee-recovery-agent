import type { FastifyInstance } from 'fastify';
import { supabase } from '@fee-recovery/db';
import { inngest } from '../lib/inngest.js';
import { requireAuth } from '../plugins/auth.js';
import { cacheIdempotentResponse } from '../plugins/idempotency.js';
import {
  CaseCreateSchema,
  BulkUploadBodySchema,
  CaseListQuerySchema,
  OverrideStageSchema,
  chunkArray,
} from '@fee-recovery/shared';
import { stringify } from 'csv-stringify/sync';
import ExcelJS from 'exceljs';

export async function caseRoutes(app: FastifyInstance) {
  // POST /v1/cases — single case
  app.post('/', { preHandler: [requireAuth] }, async (req, reply) => {
    const parsed = CaseCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues });

    if (req.tenant.token_balance < 1) {
      return reply.code(402).send({ error: 'Insufficient token balance' });
    }

    const { data: existing } = await supabase
      .from('cases')
      .select('id')
      .eq('tenant_id', req.tenant.id)
      .eq('case_id', parsed.data.case_id)
      .single();
    if (existing) return reply.code(409).send({ error: 'Case ID already exists' });

    const { data, error } = await supabase
      .from('cases')
      .insert({ ...parsed.data, tenant_id: req.tenant.id })
      .select()
      .single();
    if (error) return reply.code(500).send({ error: error.message });

    await supabase
      .from('tenants')
      .update({ token_balance: req.tenant.token_balance - 1 })
      .eq('id', req.tenant.id);

    await inngest.send({ name: 'case/created', data: { case_id: data.id, tenant_id: req.tenant.id } });

    const body = data;
    await cacheIdempotentResponse(req, 201, body);
    return reply.code(201).send(body);
  });

  // POST /v1/cases/bulk
  app.post('/bulk', { preHandler: [requireAuth] }, async (req, reply) => {
    const parsed = BulkUploadBodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues });

    const { cases, dry_run } = parsed.data;
    const results = cases.map((c, i) => {
      const r = CaseCreateSchema.safeParse(c);
      return {
        row: i + 1,
        valid: r.success,
        errors: r.success ? [] : r.error.issues.map((e) => e.message),
        data: r.success ? r.data : null,
      };
    });

    const validRows = results.filter((r) => r.valid);
    const invalidRows = results.filter((r) => !r.valid);

    if (dry_run) {
      return reply.send({ valid_count: validRows.length, invalid_count: invalidRows.length, errors: invalidRows });
    }

    const tokensNeeded = validRows.length;
    if (req.tenant.token_balance < tokensNeeded) {
      return reply.code(402).send({ error: `Need ${tokensNeeded} tokens, have ${req.tenant.token_balance}` });
    }

    const inserted: unknown[] = [];
    for (const chunk of chunkArray(validRows, 50)) {
      const { data: rows, error } = await supabase
        .from('cases')
        .upsert(
          chunk.map((r) => ({ ...r.data!, tenant_id: req.tenant.id })),
          { onConflict: 'tenant_id,case_id', ignoreDuplicates: true }
        )
        .select();
      if (!error && rows) {
        inserted.push(...rows);
        await inngest.send(rows.map((c) => ({ name: 'case/created', data: { case_id: c.id, tenant_id: req.tenant.id } })));
      }
    }

    await supabase
      .from('tenants')
      .update({ token_balance: req.tenant.token_balance - inserted.length })
      .eq('id', req.tenant.id);

    return reply.send({
      inserted: inserted.length,
      skipped: invalidRows.length,
      errors: invalidRows,
      platform_case_ids: (inserted as Array<{ id: string }>).map((c) => c.id),
    });
  });

  // GET /v1/cases
  app.get('/', { preHandler: [requireAuth] }, async (req, reply) => {
    const query = CaseListQuerySchema.parse(req.query);
    const { page, limit, sort, status, from, to, fee_type, search } = query;

    let q = supabase
      .from('cases')
      .select('*', { count: 'exact' })
      .eq('tenant_id', req.tenant.id)
      .range((page - 1) * limit, page * limit - 1);

    if (status) q = q.eq('status', status);
    if (from) q = q.gte('created_at', from);
    if (to) q = q.lte('created_at', to);
    if (fee_type) q = q.eq('fee_type', fee_type);
    if (search) q = q.or(`student_name.ilike.%${search}%,parent_phone.ilike.%${search}%`);

    const [field, dir] = sort.split(':');
    q = q.order(field, { ascending: dir !== 'desc' });

    const { data, error, count } = await q;
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ data, total: count, page, limit });
  });

  // GET /v1/cases/export
  app.get('/export', { preHandler: [requireAuth] }, async (req, reply) => {
    const { format = 'csv', ...filters } = req.query as Record<string, string>;
    const query = CaseListQuerySchema.parse({ ...filters, limit: 10000, page: 1 });

    let q = supabase.from('cases').select('*').eq('tenant_id', req.tenant.id);
    if (query.status) q = q.eq('status', query.status);
    if (query.from) q = q.gte('created_at', query.from);
    if (query.to) q = q.lte('created_at', query.to);

    const { data, error } = await q;
    if (error) return reply.code(500).send({ error: error.message });

    if (format === 'xlsx') {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Cases');
      ws.columns = [
        { header: 'Student Name', key: 'student_name' },
        { header: 'Parent Phone', key: 'parent_phone' },
        { header: 'Fee Amount', key: 'fee_amount' },
        { header: 'Due Date', key: 'due_date' },
        { header: 'Days Overdue', key: 'days_overdue' },
        { header: 'Status', key: 'status' },
        { header: 'Fee Type', key: 'fee_type' },
      ];
      ws.addRows(data ?? []);
      const buf = await wb.xlsx.writeBuffer();
      reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      reply.header('Content-Disposition', 'attachment; filename="cases.xlsx"');
      return reply.send(buf);
    }

    const csv = stringify(data ?? [], { header: true });
    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', 'attachment; filename="cases.csv"');
    return reply.send(csv);
  });

  // GET /v1/cases/:id
  app.get('/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { data, error } = await supabase
      .from('cases')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', req.tenant.id)
      .single();
    if (error || !data) return reply.code(404).send({ error: 'Case not found' });
    return reply.send(data);
  });

  // GET /v1/cases/:id/timeline
  app.get('/:id/timeline', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { data, error } = await supabase
      .from('timeline_events')
      .select('*')
      .eq('case_id', id)
      .eq('tenant_id', req.tenant.id)
      .order('created_at', { ascending: false });
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send(data);
  });

  // POST /v1/cases/:id/note
  app.post('/:id/note', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { text } = req.body as { text: string };
    if (!text?.trim()) return reply.code(400).send({ error: 'text is required' });

    const { error } = await supabase.from('timeline_events').insert({
      case_id: id,
      tenant_id: req.tenant.id,
      type: 'note',
      content: text,
    });
    if (error) return reply.code(500).send({ error: error.message });
    return reply.code(201).send({ ok: true });
  });

  // POST /v1/cases/:id/hold
  app.post('/:id/hold', { preHandler: [requireAuth] }, async (req, reply) => {
    return updateCaseStatus(req, reply, 'HOLD');
  });

  // POST /v1/cases/:id/resolve
  app.post('/:id/resolve', { preHandler: [requireAuth] }, async (req, reply) => {
    return updateCaseStatus(req, reply, 'RESOLVED');
  });

  // POST /v1/cases/:id/escalate
  app.post('/:id/escalate', { preHandler: [requireAuth] }, async (req, reply) => {
    return updateCaseStatus(req, reply, 'ESCALATED');
  });

  // PATCH /v1/cases/:id/override-stage
  app.patch('/:id/override-stage', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = OverrideStageSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues });

    const { error } = await supabase
      .from('cases')
      .update({ current_stage: parsed.data.stage })
      .eq('id', id)
      .eq('tenant_id', req.tenant.id);
    if (error) return reply.code(500).send({ error: error.message });

    await supabase.from('timeline_events').insert({
      case_id: id,
      tenant_id: req.tenant.id,
      type: 'stage_change',
      content: `Stage overridden to ${parsed.data.stage}`,
    });

    await inngest.send({
      name: 'case/stage-overridden',
      data: { case_id: id, tenant_id: req.tenant.id, stage: parsed.data.stage },
    });

    return reply.send({ ok: true });
  });
}

const TERMINAL_STATUSES = ['RESOLVED', 'ON_HOLD', 'ESCALATED', 'PROMISE_TO_PAY'];

async function updateCaseStatus(req: FastifyRequest, reply: FastifyReply, status: string) {
  const { id } = req.params as { id: string };
  const { error } = await supabase
    .from('cases')
    .update({ status, last_action_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', req.tenant.id);
  if (error) return reply.code(500).send({ error: error.message });

  await supabase.from('timeline_events').insert({
    case_id: id,
    tenant_id: req.tenant.id,
    type: 'status_change',
    content: `Status changed to ${status}`,
  });

  // Cancel the running reminder workflow so no more messages fire
  if (TERMINAL_STATUSES.includes(status)) {
    await inngest.send({
      name: 'case/cancelled',
      data: { case_id: id, tenant_id: req.tenant.id, reason: status },
    });
  }

  return reply.send({ ok: true });
}

import type { FastifyRequest, FastifyReply } from 'fastify';
