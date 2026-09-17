import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../', import.meta.url));
if (!process.argv[2]) throw new Error('Usage: node scripts/copy-workflow.mjs /path/to/target');
const target = resolve(process.argv[2]);
if (!existsSync(resolve(target, 'package.json'))) throw new Error('Target must contain package.json');
const files = [
  'CONTRIBUTING.md',
  'AGENTS.md',
  'CLAUDE.md',
  'SECURITY.md',
  'commitlint.config.js',
  'release.config.js',
  '.husky/commit-msg',
  '.husky/pre-commit',
  '.github/ISSUE_TEMPLATE/feature.yml',
  '.github/pull_request_template.md',
  '.github/workflows/ci.yml',
  '.github/workflows/release.yml',
  'scripts/check-pr.mjs',
  'scripts/prepare-package.mjs',
  'scripts/copy-workflow.mjs',
  'docs/releasing.md',
  'docs/workflow-rollout.md',
];
if (existsSync(resolve(source, 'LICENSE'))) files.push('LICENSE');
for (const file of files) {
  if (!existsSync(resolve(source, file))) throw new Error(`Missing source: ${file}`);
  if (existsSync(resolve(target, file))) throw new Error(`Refusing to overwrite: ${file}`);
}
for (const file of files) {
  const destination = resolve(target, file);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(resolve(source, file), destination);
}
console.log(
  'Copied workflow files. Follow docs/workflow-rollout.md to adapt package.json, paths, identity, license, coverage and size budgets; then run pnpm install.',
);
