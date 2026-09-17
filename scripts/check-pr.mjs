import { spawnSync } from 'node:child_process';

const { PR_TITLE = '', PR_BODY = '', PR_BASE, PR_HEAD, PR_HEAD_REPO, GITHUB_REPOSITORY, GITHUB_TOKEN } = process.env;

const lint = spawnSync('pnpm', ['exec', 'commitlint'], { input: PR_TITLE, encoding: 'utf8' });
if (lint.status !== 0) throw new Error(lint.stdout + lint.stderr);

if (PR_BASE !== 'main') throw new Error('PRs must target main.');
if (PR_HEAD_REPO !== GITHUB_REPOSITORY) throw new Error('PRs must come from this repository, not a fork.');

const branch = /^(?:feat|feature|fix|chore|docs|refactor|test|ci|build|perf|style|revert)\/(\d+)-[a-z0-9-]+$/.exec(
  PR_HEAD ?? '',
);
if (!branch) throw new Error('Use a branch such as feat/42-batch-export.');

const [, issueNumber] = branch;
const closes = [...PR_BODY.matchAll(/\b(?:closes|fixes|resolves)\s+#(\d+)\b/gi)];
if (!closes.some((match) => match[1] === issueNumber)) {
  throw new Error(`PR body must contain Closes #${issueNumber}.`);
}

const issueResponse = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/issues/${issueNumber}`, {
  headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
});
if (!issueResponse.ok) throw new Error(`Issue #${issueNumber} could not be verified (HTTP ${issueResponse.status}).`);
const issue = await issueResponse.json();
if (issue.state !== 'open') throw new Error(`Issue #${issueNumber} must be open.`);
