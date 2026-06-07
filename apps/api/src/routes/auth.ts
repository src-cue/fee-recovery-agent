import type { FastifyInstance } from 'fastify';
import { supabase } from '@fee-recovery/db';
import { requireAuth } from '../plugins/auth.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/login', async (req, reply) => {
    const { email, password } = req.body as { email: string; password: string };
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) return reply.code(401).send({ error: 'Invalid credentials' });

    const { data: tenant } = await supabase
      .from('tenants')
      .select('*')
      .eq('email', email)
      .single();
    if (!tenant) return reply.code(404).send({ error: 'Tenant not found' });

    const token = app.jwt.sign({ tenant_id: tenant.id }, { expiresIn: '7d' });
    return reply.send({ token, tenant });
  });

  app.post('/logout', { preHandler: [requireAuth] }, async (_req, reply) => {
    return reply.send({ ok: true });
  });

  app.get('/me', { preHandler: [requireAuth] }, async (req, reply) => {
    return reply.send(req.tenant);
  });
}
