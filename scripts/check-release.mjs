import assert from 'node:assert/strict';
import { analyzeCommits } from '@semantic-release/commit-analyzer';
import { generateNotes } from '@semantic-release/release-notes-generator';
import config from '../release.config.js';

const pluginOptions = (name) => config.plugins.find((entry) => Array.isArray(entry) && entry[0] === name)[1];
const context = {
  cwd: process.cwd(),
  logger: { log() {} },
  options: { repositoryUrl: 'https://github.com/bhouston/axios-eventsource.git' },
  lastRelease: { gitTag: 'v0.2.1' },
  nextRelease: { version: '0.2.2', gitTag: 'v0.2.2' },
};
for (const [message, expected] of [
  ['fix: restore stream parsing', 'patch'],
  ['feat: add typed events', 'minor'],
  ['feat!: change event interface', 'major'],
  ['fix: change interface\n\nBREAKING CHANGE: remove old interface', 'major'],
  ['docs: explain configuration', null],
]) {
  const commits = [{ hash: '1234567890abcdef1234567890abcdef12345678', message }];
  const releaseType = await analyzeCommits(pluginOptions('@semantic-release/commit-analyzer'), { ...context, commits });
  assert.equal(releaseType, expected, message);
  // Render the actual preset with the installed writer, catching incompatible dependency upgrades.
  const notes = await generateNotes(pluginOptions('@semantic-release/release-notes-generator'), {
    ...context,
    commits,
  });
  assert.match(notes, /0\.2\.2/);
  if (expected) assert.ok(notes.includes(message.split('\n')[0].split(': ')[1]), notes);
}
console.log('Release analysis and release-note rendering passed.');
