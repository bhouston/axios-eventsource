import { copyFileSync } from 'node:fs';

for (const file of ['README.md', 'LICENSE']) {
  copyFileSync(file, `packages/axios-eventsource/${file}`);
}
