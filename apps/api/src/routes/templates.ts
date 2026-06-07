import type { FastifyInstance } from 'fastify';
import { supabase } from '@fee-recovery/db';
import { requireAuth } from '../plugins/auth.js';
import { TemplateCreateSchema, interpolateTemplate } from '@fee-recovery/shared';

export async function templateRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [requireAuth] }, async (req, reply) => {
    const { data, error } = await supabase
      .from('templates')
      .select('*')
      .or(`tenant_id.eq.${req.tenant.id},is_builtin.eq.true`)
      .order('created_at', { ascending: false });
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send(data);
  });

  app.post('/', { preHandler: [requireAuth] }, async (req, reply) => {
    const parsed = TemplateCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues });
    const { data, error } = await supabase
      .from('templates')
      .insert({ ...parsed.data, tenant_id: req.tenant.id })
      .select()
      .single();
    if (error) return reply.code(500).send({ error: error.message });
    return reply.code(201).send(data);
  });

  app.put('/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = TemplateCreateSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues });
    const { data, error } = await supabase
      .from('templates')
      .update(parsed.data)
      .eq('id', id)
      .eq('tenant_id', req.tenant.id)
      .select()
      .single();
    if (error || !data) return reply.code(404).send({ error: 'Template not found' });
    return reply.send(data);
  });

  app.delete('/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { error } = await supabase
      .from('templates')
      .delete()
      .eq('id', id)
      .eq('tenant_id', req.tenant.id)
      .eq('is_builtin', false);
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ ok: true });
  });

  app.post('/:id/submit-for-approval', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { error } = await supabase
      .from('templates')
      .update({ status: 'pending_approval' })
      .eq('id', id)
      .eq('tenant_id', req.tenant.id);
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ ok: true, message: 'Submitted for Meta approval' });
  });

  app.get('/:id/preview', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const sample_vars = (req.query as Record<string, string>) ?? {};
    const { data, error } = await supabase.from('templates').select('body').eq('id', id).single();
    if (error || !data) return reply.code(404).send({ error: 'Template not found' });
    const rendered = interpolateTemplate(data.body, sample_vars);
    return reply.send({ rendered });
  });
}
