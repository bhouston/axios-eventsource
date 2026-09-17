import { copyFileSync, existsSync } from 'node:fs';

copyFileSync('README.md', 'packages/axios-eventsource/README.md');
if (existsSync('LICENSE')) copyFileSync('LICENSE', 'packages/axios-eventsource/LICENSE');
