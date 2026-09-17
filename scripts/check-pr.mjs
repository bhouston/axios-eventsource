import { spawnSync } from 'node:child_process';

const { PR_TITLE = '', PR_BODY = '', PR_BASE, PR_HEAD, PR_HEAD_REPO, GITHUB_REPOSITORY } = process.env;
const lint = spawnSync('pnpm', ['exec', 'commitlint'], { input: PR_TITLE, encoding: 'utf8' });
if (lint.status !== 0) throw new Error(lint.stdout + lint.stderr);
if (PR_BASE === 'main') {
  if (PR_HEAD !== 'dev' || PR_HEAD_REPO !== GITHUB_REPOSITORY) {
    throw new Error('Only the repository dev branch may target main.');
  }
} else if (PR_BASE === 'dev') {
  const branch = /^(?:feat|feature|fix|chore|docs|refactor|test|ci|build|perf|style|revert)\/(\d+)-[a-z0-9-]+$/.exec(
    PR_HEAD ?? '',
  );
  if (!branch) throw new Error('Use a branch such as feat/42-batch-export.');
  const closes = [...PR_BODY.matchAll(/\b(?:closes|fixes|resolves)\s+#(\d+)\b/gi)];
  if (!closes.some((match) => match[1] === branch[1])) {
    throw new Error(`PR body must contain Closes #${branch[1]}.`);
  }
} else {
  throw new Error('PRs must target dev, or main for releases.');
}
