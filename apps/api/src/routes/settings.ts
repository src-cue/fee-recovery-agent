import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { supabase } from '@fee-recovery/db';
import { requireAuth } from '../plugins/auth.js';
import { PolicyLadderSchema } from '@fee-recovery/shared';

export async function settingsRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [requireAuth] }, async (req, reply) => {
    return reply.send(req.tenant);
  });

  app.put('/', { preHandler: [requireAuth] }, async (req, reply) => {
    const allowed = ['school_name', 'timezone', 'currency', 'default_language', 'callback_url', 'erp_type'];
    const updates = Object.fromEntries(
      Object.entries(req.body as Record<string, unknown>).filter(([k]) => allowed.includes(k))
    );
    const { data, error } = await supabase
      .from('tenants')
      .update(updates)
      .eq('id', req.tenant.id)
      .select()
      .single();
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send(data);
  });

  app.get('/api-key', { preHandler: [requireAuth] }, async (req, reply) => {
    const key = req.tenant.api_key;
    return reply.send({ api_key: `${key.slice(0, 8)}${'*'.repeat(key.length - 8)}` });
  });

  app.post('/api-key/regenerate', { preHandler: [requireAuth] }, async (req, reply) => {
    const newKey = crypto.randomBytes(32).toString('hex');
    const { error } = await supabase
      .from('tenants')
      .update({ api_key: newKey })
      .eq('id', req.tenant.id);
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ api_key: newKey });
  });

  app.get('/policy-ladder', { preHandler: [requireAuth] }, async (req, reply) => {
    return reply.send(req.tenant.policy_ladder ?? defaultPolicyLadder());
  });

  app.put('/policy-ladder', { preHandler: [requireAuth] }, async (req, reply) => {
    const parsed = PolicyLadderSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues });
    const { error } = await supabase
      .from('tenants')
      .update({ policy_ladder: parsed.data })
      .eq('id', req.tenant.id);
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send(parsed.data);
  });

  app.get('/channels', { preHandler: [requireAuth] }, async (req, reply) => {
    return reply.send(req.tenant.channel_settings ?? { order: ['whatsapp', 'call', 'sms'] });
  });

  app.put('/channels', { preHandler: [requireAuth] }, async (req, reply) => {
    const { error } = await supabase
      .from('tenants')
      .update({ channel_settings: req.body })
      .eq('id', req.tenant.id);
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send(req.body);
  });
}

function defaultPolicyLadder() {
  return {
    stages: [
      { stage: 'P1', day_trigger: 1, channel: 'whatsapp', enabled: true },
      { stage: 'P2', day_trigger: 5, channel: 'whatsapp', enabled: true },
      { stage: 'P3', day_trigger: 10, channel: 'call', enabled: true },
      { stage: 'P4', day_trigger: 15, channel: 'sms', enabled: true },
    ],
    daily_cap: 1,
    blackout_start: '21:00',
    blackout_end: '08:00',
    test_mode: false,
  };
}
