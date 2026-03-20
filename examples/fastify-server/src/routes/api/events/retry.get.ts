import { defineRoute } from 'fastify-file-router';

/**
 * Server-driven retry demo:
 * - Emits retry: <ms> at the start to tell the client how long to wait before reconnecting.
 * - Disconnects quickly so the client is forced to reconnect using the server-supplied delay.
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

    // Instruct clients to wait 3 seconds before reconnecting.
    reply.raw.write('retry: 3000\n\n');

    let count = 0;
    const timer = setInterval(() => {
      count += 1;
      const payload = {
        source: 'fastify',
        count,
        retrySetByServer: 3000,
        timestamp: new Date().toISOString(),
      };
      reply.raw.write(`event: tick\nid: ${count}\ndata: ${JSON.stringify(payload)}\n\n`);

      // Disconnect after 3 events to let the retry delay take effect.
      if (count >= 3) {
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
