# Contributing

This is the shared workflow for humans, Claude, and Codex. Read it before making changes.

## Issue → branch → PR

1. Before implementing a feature or fix, open a GitHub issue (or reuse the matching existing issue). Use the feature/improvement template: description and motivation, acceptance criteria, and constraints. Agents using `gh issue create` must include the same fields.
2. Fetch `origin` and branch from `origin/main`. Branch names are not restricted to any convention. Never commit directly to `main`.
3. Use Conventional Commits for every commit: `<type>(optional-scope): description`. Types are `feat`, `fix`, `perf`, `docs`, `chore`, `refactor`, `test`, `style`, `ci`, `build`, and `revert`. Reference the issue in the body when useful. Husky runs commitlint locally; CI checks PR commits and titles. Do not bypass hooks.
4. Run `pnpm build`, `pnpm tsc`, `pnpm lint`, `pnpm test --coverage`, `pnpm audit --audit-level high`, and `pnpm size`. Resolve build, lint, test, and size failures before requesting review. Dependency auditing is initially advisory because the existing dependency tree has known vulnerabilities; review its findings and track remediation separately. Coverage minimums are 90% statements/lines, 85% branches, and 95% functions. The library bundle budget is 8 kB compressed, excluding Axios and Zod peers.
5. Push the branch and open a PR against `main`. Use a Conventional Commit title and include `Closes #<issue>` matching the branch issue, the resulting behavior, and validation results. PRs are merged with merge commits (`gh pr merge --merge`); do not squash. Do not merge your own PR unless the user explicitly requests it.
6. Merging a PR into `main` runs CI but never publishes. When ready to release, the maintainer manually dispatches the release workflow: `gh workflow run release.yml --ref main`. Semantic Release analyzes commits since the last tag, then publishes, tags, and creates a GitHub release. No promotion or sync-back PRs are needed.

`feat` triggers a minor release; `fix` and `perf` trigger a patch. A `!` after the type/scope or a `BREAKING CHANGE:` footer triggers a major release, including during 0.x. Other types do not normally trigger releases. Do not manually edit versions or generated changelogs.

`main` is the default branch, so ordinary feature PRs close their linked issues on merge.

## Local setup

Use the Node version in `.nvmrc` and the pnpm version in `package.json`, then run `pnpm install`. Installation enables Husky's pre-commit and commit-msg hooks. `pnpm dev` starts the library and demos.

## Releases

See [release setup](docs/releasing.md). Semantic Release is configured for the only publishable package, `packages/axios-eventsource`. Workspace examples and test packages remain private. The release runner updates the published package version and creates a changelog asset and GitHub release notes. Generated package metadata is not committed back to source; Git tags and npm are authoritative for published versions. Each changelog asset describes that release; the GitHub Releases list is the cumulative history.

## Reusing this workflow

See [workflow rollout](docs/workflow-rollout.md). Keep these rules in CONTRIBUTING.md; AGENTS.md and CLAUDE.md should only point here.
