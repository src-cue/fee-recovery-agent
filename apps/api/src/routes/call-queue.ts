import type { FastifyInstance } from 'fastify';
import { supabase } from '@fee-recovery/db';
import { inngest } from '../lib/inngest.js';
import { requireAuth } from '../plugins/auth.js';
import { refreshPriorityScores } from '../lib/ai-priority.js';
import { providerRouter } from '@fee-recovery/providers';

const TERMINAL_STATUSES = ['RESOLVED', 'ON_HOLD', 'ESCALATED', 'PROMISE_TO_PAY'];

export async function callQueueRoutes(app: FastifyInstance) {
  // GET /v1/call-queue — AI-ranked list of cases to call
  app.get('/', { preHandler: [requireAuth] }, async (req, reply) => {
    const { refresh } = req.query as { refresh?: string };

    // Optionally re-score all cases with AI
    if (refresh === 'true') {
      await refreshPriorityScores(req.tenant.id);
    }

    const { data, error } = await supabase
      .from('cases')
      .select('id, case_id, student_name, parent_name, parent_phone, fee_amount, currency, days_overdue, fee_type, call_attempts, last_call_at, priority_score, priority_reason, status, current_stage, last_action_at')
      .eq('tenant_id', req.tenant.id)
      .eq('status', 'ACTIVE')
      .order('priority_score', { ascending: false })
      .limit(50);

    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ data: data ?? [] });
  });

  // POST /v1/call-queue/:id/dial — trigger an outbound AI call
  app.post('/:id/dial', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const { data: caseRow, error } = await supabase
      .from('cases')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', req.tenant.id)
      .single();

    if (error || !caseRow) return reply.code(404).send({ error: 'Case not found' });
    if (caseRow.status !== 'ACTIVE') return reply.code(400).send({ error: 'Case is not active' });

    const provider = await providerRouter.pickCalling();
    const session = await provider.dial(
      caseRow.parent_phone,
      `${process.env.BASE_URL}/v1/webhooks/call-twiml`,
      `${process.env.BASE_URL}/v1/webhooks/call-events`,
    );

    // Record dial attempt in timeline
    await supabase.from('timeline_events').insert({
      case_id: id,
      tenant_id: req.tenant.id,
      type: 'call',
      channel: 'call',
      direction: 'outbound',
      content: `Outbound call initiated to ${caseRow.parent_phone}`,
      message_id: session.callSid,
      metadata: { provider: provider.name, status: session.status },
    });

    await supabase
      .from('cases')
      .update({ last_action_at: new Date().toISOString(), call_attempts: (caseRow.call_attempts ?? 0) + 1 })
      .eq('id', id);

    return reply.send({ callSid: session.callSid, status: session.status, provider: provider.name });
  });

  // PATCH /v1/call-queue/:id/status — manual status update
  app.patch('/:id/status', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { status, note } = req.body as { status: string; note?: string };

    const VALID = ['ACTIVE', 'RESOLVED', 'ON_HOLD', 'ESCALATED', 'PROMISE_TO_PAY'];
    if (!VALID.includes(status)) return reply.code(400).send({ error: `Invalid status. Must be one of: ${VALID.join(', ')}` });

    await supabase.from('cases').update({ status, last_action_at: new Date().toISOString() }).eq('id', id).eq('tenant_id', req.tenant.id);

    if (note || status !== 'ACTIVE') {
      await supabase.from('timeline_events').insert({
        case_id: id,
        tenant_id: req.tenant.id,
        type: 'status_change',
        content: note ?? `Status updated to ${status}`,
      });
    }

    // Cancel the running reminder workflow so no more messages fire
    if (TERMINAL_STATUSES.includes(status)) {
      await inngest.send({
        name: 'case/cancelled',
        data: { case_id: id, tenant_id: req.tenant.id, reason: status },
      });
    }

    return reply.send({ ok: true, status });
  });
}
