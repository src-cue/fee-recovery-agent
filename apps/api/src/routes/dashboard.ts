import type { FastifyInstance } from 'fastify';
import { supabase } from '@fee-recovery/db';
import { requireAuth } from '../plugins/auth.js';

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/summary', { preHandler: [requireAuth] }, async (req, reply) => {
    const tid = req.tenant.id;
    const [active, resolved, total, usage] = await Promise.all([
      supabase.from('cases').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).eq('status', 'ACTIVE'),
      supabase.from('cases').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).eq('status', 'RESOLVED')
        .gte('updated_at', new Date(Date.now() - 30 * 86400000).toISOString()),
      supabase.from('cases').select('id', { count: 'exact', head: true }).eq('tenant_id', tid),
      supabase.from('token_usage').select('tokens.sum()', { count: 'exact', head: false }).eq('tenant_id', tid)
        .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()),
    ]);
    const resolvedCount = resolved.count ?? 0;
    const totalCount = total.count ?? 1;
    return reply.send({
      active_cases: active.count ?? 0,
      resolved_this_month: resolvedCount,
      touchless_recovery_rate: Math.round((resolvedCount / totalCount) * 100),
      token_balance: req.tenant.token_balance,
    });
  });

  app.get('/trend', { preHandler: [requireAuth] }, async (req, reply) => {
    const { days = '30' } = req.query as { days?: string };
    const since = new Date(Date.now() - parseInt(days) * 86400000).toISOString();
    const { data, error } = await supabase
      .from('cases')
      .select('status, updated_at')
      .eq('tenant_id', req.tenant.id)
      .in('status', ['RESOLVED', 'ESCALATED'])
      .gte('updated_at', since);
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send(data);
  });

  app.get('/activity', { preHandler: [requireAuth] }, async (req, reply) => {
    const { limit = '10' } = req.query as { limit?: string };
    const { data, error } = await supabase
      .from('timeline_events')
      .select('*, cases(student_name, parent_phone)')
      .eq('tenant_id', req.tenant.id)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send(data);
  });

  app.get('/channel-stats', { preHandler: [requireAuth] }, async (req, reply) => {
    const { data, error } = await supabase
      .from('timeline_events')
      .select('channel, intent')
      .eq('tenant_id', req.tenant.id)
      .not('channel', 'is', null);
    if (error) return reply.code(500).send({ error: error.message });

    const stats = (data ?? []).reduce<Record<string, { sent: number; resolved: number }>>((acc, e) => {
      const ch = e.channel as string;
      if (!acc[ch]) acc[ch] = { sent: 0, resolved: 0 };
      acc[ch].sent++;
      if (e.intent === 'paid' || e.intent === 'promise') acc[ch].resolved++;
      return acc;
    }, {});

    return reply.send(stats);
  });
}
