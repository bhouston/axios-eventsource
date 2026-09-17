# Release setup and operation

## npm trusted publisher

For the existing `axios-eventsource` package, open npm package Settings → Trusted publishing and select GitHub Actions:

| Field                | Value                      |
| -------------------- | -------------------------- |
| Organization or user | `bhouston`                 |
| Repository           | `axios-eventsource`        |
| Workflow filename    | `release.yml`              |
| Environment          | Leave empty                |
| Allowed actions      | Allow direct `npm publish` |

Do this before merging the first release PR into `main`. No `NPM_TOKEN` or `NODE_AUTH_TOKEN` secret is required. The release job runs on a GitHub-hosted runner with `id-token: write`; the pinned Node 26 runtime includes an OIDC-capable npm. Do not add `registry-url` to setup-node: it is unnecessary for this configuration. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) and [Semantic Release on GitHub Actions](https://semantic-release.gitbook.io/semantic-release/recipes/ci-configurations/github-actions).

## License

The repository does not yet declare a license. A maintainer must choose one before a LICENSE and package license identifier can be added; workflow setup does not grant new licensing rights. When a root LICENSE is present, it is copied into the published package.

## GitHub setup

- Use `dev` as the default branch. Require PRs and the `Build, test, audit, and size` check on `dev` and `main`. Disable force pushes and deletion. Enable merge commits (needed for release PRs) and squash merges (for feature PRs).
- Enable private vulnerability reporting under repository Settings → Security. Reports go to the repository's Security → Advisories page.
- Dependency audit currently reports known vulnerabilities and is advisory. Promote it to a blocking gate once the existing dependency tree has been remediated.
- Configure `CODECOV_TOKEN` if needed for uploads; the coverage gate runs locally and in CI independently of Codecov availability.
- The existing npm `0.2.1` release has `gitHead` `3651d35a9cc1e31c2bd6bec3c0534d6446adf5c8`. The setup created and pushed `v0.2.1` at that commit. Do not tag the current tip: that would omit unreleased changes. The tag records the registry's baseline, not a new publication.

## Publishing

Merge feature PRs into `dev`. When ready, open a release PR from `dev` to `main` and use a merge commit. The `release.yml` workflow reruns the quality checks at the exact main commit, then Semantic Release analyzes commits since the last version tag. If there are no release-worthy commits, it does not publish. Otherwise it generates release notes and a changelog, prepares the README and license, updates the package version, publishes with OIDC/provenance, tags, and creates a GitHub release with the changelog attached.

Do not run manual `npm publish` or hand-edit package versions. Source package.json remains a development baseline; the release runner sets the actual version in the published artifact. Changes to CI alone do not force a package release. `pnpm release --dry-run` is useful in configured CI but still verifies repository and npm authentication; it is not an offline check.

After release, merge `main` into `dev` so tags and history remain shared. If npm publication succeeds but a later release step fails, inspect npm and GitHub before retrying; published versions cannot be overwritten.
