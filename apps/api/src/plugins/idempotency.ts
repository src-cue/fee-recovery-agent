import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { redis } from '../app.js';

export const idempotencyPlugin = fp(async (app: FastifyInstance) => {
  app.addHook('preHandler', async (req, reply) => {
    const key = req.headers['idempotency-key'] as string | undefined;
    if (!key || req.method !== 'POST') return;

    const cached = await redis.get(`idempotency:${key}`);
    if (cached) {
      const { status, body } = cached as { status: number; body: unknown };
      return reply.code(status).send(body);
    }

    req.idempotencyKey = key;
  });
});

export async function cacheIdempotentResponse(
  req: FastifyRequest,
  status: number,
  body: unknown
): Promise<void> {
  if (!req.idempotencyKey) return;
  await redis.set(
    `idempotency:${req.idempotencyKey}`,
    JSON.stringify({ status, body }),
    { ex: 86400 }
  );
}

import type { FastifyRequest } from 'fastify';
