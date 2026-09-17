# Reusing the workflow

Validate this pilot by reviewing its setup PR into `dev`, then merging a small `fix:` or `feat:` PR and promoting `dev` to `main` after npm trust is configured. Confirm the issue closes, coverage/audit/size checks pass, and npm publishes with provenance. Publishing is intentionally not part of the setup smoke test.

After the pilot is proven, create `dev-workflow-template` and mark it as a GitHub template. Copy CONTRIBUTING.md, the small AGENTS.md/CLAUDE.md pointers, SECURITY.md, the chosen LICENSE, commitlint.config.js, .husky, .github templates/workflows, release.config.js, and the workflow scripts. Copy relevant devDependencies and scripts from package.json and coverage thresholds from vitest.config.ts.

For existing repositories, use `node scripts/copy-workflow.mjs /absolute/path/to/target`. It refuses to overwrite files and prints the remaining integration steps. Merge shared rules into existing instructions instead of overwriting them. Adapt repository identity, package paths, runtime/tool versions, license holder, test coverage and bundle budget. Do not copy this repository's v0.2.1 tag or assume the same published version. Verify each package's release baseline against its registry metadata. Set up its dev branch, required checks, Codecov, and npm trust separately.

The script is a starting point, not a universal installer: release configuration and package-manager setup require review for each repository, especially repositories with multiple publishable packages.
