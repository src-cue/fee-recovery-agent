import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabase } from '@fee-recovery/db';
import type { Tenant } from '@fee-recovery/shared';

declare module 'fastify' {
  interface FastifyRequest {
    tenant: Tenant;
    idempotencyKey?: string;
  }
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  await app.register(jwt, { secret: process.env.JWT_SECRET! });
});

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return reply.code(401).send({ error: 'Missing authorization header' });
  }

  // Support both Bearer JWT and API key (frk_live_xxx)
  if (authHeader.startsWith('Bearer frk_')) {
    const apiKey = authHeader.replace('Bearer ', '');
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('api_key', apiKey)
      .single();
    if (error || !data) return reply.code(401).send({ error: 'Invalid API key' });
    req.tenant = data as Tenant;
    return;
  }

  try {
    const payload = await req.jwtVerify<{ tenant_id: string }>();
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', payload.tenant_id)
      .single();
    if (error || !data) return reply.code(401).send({ error: 'Tenant not found' });
    req.tenant = data as Tenant;
  } catch {
    return reply.code(401).send({ error: 'Invalid token' });
  }
}
