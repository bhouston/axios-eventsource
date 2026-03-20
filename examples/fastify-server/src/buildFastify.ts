import path from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { fastifyFileRouter } from 'fastify-file-router';

export async function buildFastify() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
  });

  const currentDir = path.dirname(new URL(import.meta.url).pathname);
  const routesDir = path.join(currentDir, './routes');
  const cwd = process.cwd();
  const relativeRoutes = path.relative(cwd, routesDir);

  await app.register(fastifyFileRouter, {
    routesDirs: [relativeRoutes],
    buildRoot: '.',
    convention: 'remix',
  });

  return app;
}
