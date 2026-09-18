import { spawnSync } from 'node:child_process';

const { PR_TITLE = '', PR_BODY = '', PR_BASE, PR_HEAD_REPO, GITHUB_REPOSITORY, GITHUB_TOKEN } = process.env;

const lint = spawnSync('pnpm', ['exec', 'commitlint'], { input: PR_TITLE, encoding: 'utf8' });
if (lint.status !== 0) throw new Error(lint.stdout + lint.stderr);

if (PR_BASE !== 'main') throw new Error('PRs must target main.');
if (PR_HEAD_REPO !== GITHUB_REPOSITORY) throw new Error('PRs must come from this repository, not a fork.');

const closes = [...PR_BODY.matchAll(/\b(?:closes|fixes|resolves)\s+#(\d+)\b/gi)];
if (closes.length === 0) throw new Error('PR body must contain Closes #<issue>.');
const [, issueNumber] = closes[0];

const issueResponse = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/issues/${issueNumber}`, {
  headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
});
if (!issueResponse.ok) throw new Error(`Issue #${issueNumber} could not be verified (HTTP ${issueResponse.status}).`);
const issue = await issueResponse.json();
if (issue.state !== 'open') throw new Error(`Issue #${issueNumber} must be open.`);
