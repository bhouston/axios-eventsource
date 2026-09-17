export default {
  branches: ['main'],
  tagFormat: 'v${version}',
  plugins: [
    ['@semantic-release/commit-analyzer', { preset: 'conventionalcommits' }],
    ['@semantic-release/release-notes-generator', { preset: 'conventionalcommits' }],
    ['@semantic-release/changelog', { changelogFile: 'packages/axios-eventsource/CHANGELOG.md' }],
    ['@semantic-release/exec', { prepareCmd: 'node scripts/prepare-package.mjs' }],
    ['@semantic-release/npm', { pkgRoot: 'packages/axios-eventsource' }],
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
