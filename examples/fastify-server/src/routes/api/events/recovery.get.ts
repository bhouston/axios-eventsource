import { defineRoute } from 'fastify-file-router';

/**
 * Last-Event-ID recovery demo:
 * - Server reads Last-Event-ID request header (if present) to resume from that event.
 * - Emits events with explicit ids and disconnects after a few events.
 * - On reconnect the client sends Last-Event-ID so the server can skip already-seen events.
 */
export const route = defineRoute({
  schema: {
    querystring: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    } as const,
  },
  handler: async (request, reply) => {
    const origin = typeof request.headers.origin === 'string' ? request.headers.origin : undefined;
    reply.raw.setHeader('Access-Control-Allow-Origin', origin ?? '*');
    if (origin) reply.raw.setHeader('Vary', 'Origin');

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const lastEventIdHeader = request.headers['last-event-id'] as string | undefined;
    const startFrom = lastEventIdHeader ? Number.parseInt(lastEventIdHeader, 10) + 1 : 1;

    let count = startFrom;
    const maxEventsPerConnection = 3;
    let emitted = 0;

    const timer = setInterval(() => {
      emitted += 1;
      const payload = {
        source: 'fastify',
        id: count,
        timestamp: new Date().toISOString(),
        resumedFrom: lastEventIdHeader ?? null,
      };
      reply.raw.write(`event: tick\nid: ${count}\ndata: ${JSON.stringify(payload)}\n\n`);
      count += 1;

      if (emitted >= maxEventsPerConnection) {
        clearInterval(timer);
        reply.raw.end();
      }
    }, 500);

    request.raw.on('close', () => {
      clearInterval(timer);
      reply.raw.end();
    });
  },
});
