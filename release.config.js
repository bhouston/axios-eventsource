import { fileURLToPath } from 'node:url';

// Resolve our writer-compatible preset explicitly; commitlint uses a newer preset
// which pnpm may otherwise expose first to the release plugins.
const conventionalCommits = fileURLToPath(import.meta.resolve('conventional-changelog-conventionalcommits'));

export default {
  branches: ['main'],
  tagFormat: 'v${version}',
  plugins: [
    ['@semantic-release/commit-analyzer', { config: conventionalCommits }],
    ['@semantic-release/release-notes-generator', { config: conventionalCommits }],
    ['@semantic-release/changelog', { changelogFile: 'packages/axios-eventsource/CHANGELOG.md' }],
    ['@anolilab/semantic-release-pnpm', { pkgRoot: 'packages/axios-eventsource' }],
    [
      '@semantic-release/github',
      {
        successComment: false,
        failComment: false,
        releasedLabels: false,
        assets: [{ path: 'packages/axios-eventsource/CHANGELOG.md', label: 'Generated changelog' }],
      },
    ],
  ],
};
