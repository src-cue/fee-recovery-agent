import type { FastifyInstance } from 'fastify';
import { supabase } from '@fee-recovery/db';
import { redis } from '../app.js';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async (_req, reply) => {
    const checks = await Promise.allSettled([
      supabase.from('tenants').select('id').limit(1),
      redis.ping(),
    ]);
    const [db, cache] = checks;
    const healthy = checks.every((c) => c.status === 'fulfilled');
    return reply.code(healthy ? 200 : 503).send({
      status: healthy ? 'ok' : 'degraded',
      db: db.status === 'fulfilled' ? 'ok' : 'error',
      cache: cache.status === 'fulfilled' ? 'ok' : 'error',
      version: process.env.npm_package_version,
    });
  });
}
