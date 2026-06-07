import type { FastifyInstance } from 'fastify';
import { supabase } from '@fee-recovery/db';
import { requireAuth } from '../plugins/auth.js';
import { parsePeriod } from '@fee-recovery/shared';

export async function billingRoutes(app: FastifyInstance) {
  app.get('/balance', { preHandler: [requireAuth] }, async (req, reply) => {
    return reply.send({ token_balance: req.tenant.token_balance });
  });

  app.get('/usage', { preHandler: [requireAuth] }, async (req, reply) => {
    const { period = '30d' } = req.query as { period?: string };
    const days = parsePeriod(period);
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const { data, error } = await supabase
      .from('token_usage')
      .select('tokens, action, created_at')
      .eq('tenant_id', req.tenant.id)
      .gte('created_at', since)
      .order('created_at', { ascending: false });

    if (error) return reply.code(500).send({ error: error.message });

    const total = (data ?? []).reduce((s, r) => s + r.tokens, 0);
    return reply.send({ period, total_tokens_used: total, usage: data });
  });
}
