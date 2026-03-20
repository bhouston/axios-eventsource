import { defineRoute } from 'fastify-file-router';

function isAuthorized(header: string | undefined, mode: string): boolean {
  if (mode === 'none') {
    return true;
  }
  if (mode === 'bearer') {
    return header === 'Bearer demo-token';
  }
  if (mode === 'basic') {
    return header === `Basic ${Buffer.from('demo:secret').toString('base64')}`;
  }
  return false;
}

export const route = defineRoute({
  schema: {
    querystring: {
      type: 'object',
      properties: {
        auth: { type: 'string', enum: ['none', 'basic', 'bearer'] },
      },
      additionalProperties: false,
    } as const,
    body: {
      type: 'object',
      additionalProperties: true,
    } as const,
  },
  handler: async (request, reply) => {
    const mode = String((request.query as { auth?: string }).auth ?? 'none');
    if (!isAuthorized(request.headers.authorization, mode)) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const body = request.body as Record<string, unknown> | undefined;

    const origin = typeof request.headers.origin === 'string' ? request.headers.origin : undefined;
    reply.raw.setHeader('Access-Control-Allow-Origin', origin ?? '*');
    if (origin) reply.raw.setHeader('Vary', 'Origin');

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    let count = 0;
    const timer = setInterval(() => {
      count += 1;
      const basePayload = {
        source: 'fastify',
        count,
        mode,
        timestamp: new Date().toISOString(),
        ...(body ? { requestBody: body } : {}),
      };

      // Mostly valid events, occasionally edge-cases to stress parser/reconnect behavior.
      if (count % 11 === 0) {
        reply.raw.write(': ping edge-case comment\n\n');
        return;
      }
      if (count % 17 === 0) {
        reply.raw.write('event: tick\ndata: {"source":"fastify","count":\n\n');
        return;
      }
      if (count % 23 === 0) {
        reply.raw.write(`event: edge-case\ndata: ${JSON.stringify({ ...basePayload, kind: 'unknown-event' })}\n\n`);
        return;
      }
      if (count % 29 === 0) {
        reply.raw.write(
          `event: tick\ndata: ${JSON.stringify({ ...basePayload, kind: 'server-forced-disconnect' })}\n\n`,
        );
        clearInterval(timer);
        reply.raw.end();
        return;
      }

      reply.raw.write(': ping\n\n');
      reply.raw.write(`event: tick\ndata: ${JSON.stringify(basePayload)}\n\n`);
    }, 1_000);

    request.raw.on('close', () => {
      clearInterval(timer);
      reply.raw.end();
    });
  },
});
