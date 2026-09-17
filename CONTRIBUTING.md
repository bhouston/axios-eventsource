# Contributing

This is the shared workflow for humans, Claude, and Codex. Read it before making changes.

## Issue → branch → PR

1. Before implementing a feature or fix, open a GitHub issue (or reuse the matching existing issue). Use the feature/improvement template: description and motivation, acceptance criteria, and constraints. Agents using `gh issue create` must include the same fields.
2. Fetch `origin`, branch from `origin/dev`, and name the branch `<type>/<issue>-<short-description>`, for example `feat/42-batch-export`. Never commit directly to `main` or `dev`.
3. Use Conventional Commits for every commit: `<type>(optional-scope): description`. Types are `feat`, `fix`, `perf`, `docs`, `chore`, `refactor`, `test`, `style`, `ci`, `build`, and `revert`. Reference the issue in the body when useful. Husky runs commitlint locally; CI checks PR commits and titles. Do not bypass hooks.
4. Run `pnpm build`, `pnpm tsc`, `pnpm lint`, `pnpm test --coverage`, `pnpm audit --audit-level high`, and `pnpm size`. Resolve build, lint, test, and size failures before requesting review. Dependency auditing is initially advisory because the existing dependency tree has known vulnerabilities; review its findings and track remediation separately. Coverage minimums are 90% statements/lines, 85% branches, and 95% functions. The library bundle budget is 8 kB compressed, excluding Axios and Zod peers.
5. Push the branch and open a PR against `dev`. Use a Conventional Commit title and include `Closes #<issue>` matching the branch issue, the resulting behavior, and validation results. Feature PRs should be squash-merged with their Conventional Commit title. Do not merge your own PR unless the user explicitly requests it.
6. Releases use a PR from this repository's `dev` to `main`, titled `chore(release): promote dev to main`. Use a **merge commit**, never squash/rebase: release analysis must retain the original feature/fix commits and tag ancestry. Only merging to `main` triggers publishing. Sync `main` back into `dev` after each release.

`feat` triggers a minor release; `fix` and `perf` trigger a patch. A `!` after the type/scope or a `BREAKING CHANGE:` footer triggers a major release, including during 0.x. Other types do not normally trigger releases. Do not manually edit versions or generated changelogs.

GitHub only auto-closes issues from closing keywords when the PR targets the default branch. `dev` is the default integration branch so ordinary feature PRs close their issues on merge.

## Local setup

Use the Node version in `.nvmrc` and the pnpm version in `package.json`, then run `pnpm install`. Installation enables Husky's pre-commit and commit-msg hooks. `pnpm dev` starts the library and demos.

## Releases

See [release setup](docs/releasing.md). Semantic Release is configured for the only publishable package, `packages/axios-eventsource`. Workspace examples and test packages remain private. The release runner updates the published package version and creates a changelog asset and GitHub release notes. Generated package metadata is not committed back to source; Git tags and npm are authoritative for published versions. Each changelog asset describes that release; the GitHub Releases list is the cumulative history.

## Reusing this workflow

See [workflow rollout](docs/workflow-rollout.md). Keep these rules in CONTRIBUTING.md; AGENTS.md and CLAUDE.md should only point here.
