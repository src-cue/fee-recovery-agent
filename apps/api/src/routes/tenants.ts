import type { FastifyInstance } from 'fastify';
import { supabase } from '@fee-recovery/db';
import { TenantCreateSchema } from '@fee-recovery/shared';

export async function tenantRoutes(app: FastifyInstance) {
  app.post('/register', async (req, reply) => {
    const parsed = TenantCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', issues: parsed.error.issues });
    }

    const { email, password, ...rest } = parsed.data;

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authError) return reply.code(409).send({ error: authError.message });

    const { data: tenant, error } = await supabase
      .from('tenants')
      .insert({ ...rest, email })
      .select()
      .single();
    if (error) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      return reply.code(500).send({ error: error.message });
    }

    return reply.code(201).send(tenant);
  });
}
