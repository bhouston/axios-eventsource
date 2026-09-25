# Releases

## Local checks

Coverage minimums are 90% statements/lines, 85% branches, and 95% functions (`pnpm test --coverage`). The library bundle budget is 8 kB compressed, excluding the Axios and Zod peers (`pnpm size`). Dependency auditing (`pnpm audit --audit-level high`) is currently advisory in CI because the existing dependency tree has known vulnerabilities; review its findings and track remediation separately, and promote it to a blocking gate once remediated. Explain any intentional threshold change in the PR.

## npm trusted publisher

For the existing `axios-eventsource` package, open npm package Settings → Trusted publishing and select GitHub Actions:

| Field                | Value                      |
| -------------------- | -------------------------- |
| Organization or user | `bhouston`                 |
| Repository           | `axios-eventsource`        |
| Workflow filename    | `release.yml`              |
| Environment          | Leave empty                |
| Allowed actions      | Allow direct `npm publish` |

No `NPM_TOKEN` or `NODE_AUTH_TOKEN` secret is required. The release job runs on a GitHub-hosted runner with `id-token: write`; the pinned Node 26 runtime includes an OIDC-capable npm. Do not add `registry-url` to setup-node: it is unnecessary for this configuration. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) and [Semantic Release on GitHub Actions](https://semantic-release.gitbook.io/semantic-release/recipes/ci-configurations/github-actions).

## License

This project uses the MIT license. The release preparation copies the root LICENSE into the published package, whose metadata declares `MIT`.

## One-time GitHub setup

- Use `main` as the default branch. Require PRs and the `Build, test, audit, and size` check on `main`. Disable force pushes and deletion. Disable squash merges; PRs are merged with merge commits.
- Enable private vulnerability reporting under repository Settings → Security. Reports go to the repository's Security → Advisories page.
- Configure `CODECOV_TOKEN` if needed for uploads; the coverage gate runs locally and in CI independently of Codecov availability.
- The existing npm `0.2.1` release has `gitHead` `3651d35a9cc1e31c2bd6bec3c0534d6446adf5c8`. Setup created and pushed `v0.2.1` at that commit as the release baseline tag. Do not move this tag or tag it against the current tip: that would omit unreleased changes, and it is a version floor, not a new publication.

## Publishing

Merging feature PRs into `main` never publishes by itself. When ready to release, dispatch the workflow: `gh workflow run release.yml --ref main`. The run refuses to proceed if dispatched on anything other than `main`, and aborts rather than publishing if `main` advances between dispatch and the publish step (re-dispatch in that case). It reruns the quality checks at the exact commit that was on `main` at dispatch time, then semantic-release analyzes commits since the last version tag. If there are no release-worthy commits, the run succeeds as a no-op and says so in the run summary. Otherwise it generates release notes, prepares the README and license, updates the package version, publishes with OIDC/provenance, tags, and creates a GitHub release with those notes as its body. The GitHub Releases page is the changelog of record; there is no separate `CHANGELOG.md`.

Use the workflow's `dry_run` input to validate a release without publishing.

Do not run manual `npm publish` or hand-edit package versions. Source `package.json` remains a development baseline; the release runner sets the actual version in the published artifact. Changes to CI alone do not force a package release. If npm publication succeeds but a later release step fails, inspect npm and GitHub before retrying; published versions cannot be overwritten.
