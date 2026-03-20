import { buildFastify } from './buildFastify.js';

const port = Number(process.env.PORT ?? 4002);

const app = await buildFastify();
await app.listen({ host: '0.0.0.0', port });
