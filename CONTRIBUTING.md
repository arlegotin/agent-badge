# Contributing

Thanks for contributing to `agent-badge`.

## Before You Open a Change

- keep user-facing docs in sync with the CLI surface
- update [docs/CLI.md](docs/CLI.md) when commands or flags change
- update [docs/INSTALL.md](docs/INSTALL.md) and [docs/AUTH.md](docs/AUTH.md) when requirements or auth behavior changes
- update [CHANGELOG.md](CHANGELOG.md) for package-facing release changes

## Local Development

Use Node.js24 or26 for the repository-native candidate. Package/CI engine metadata alignment remains part of candidate release preparation.

```bash
npm ci
npm run typecheck
npm run build
npm test -- --run
npm run docs:check
```

Use `npm run verify:clean-checkout` before release-oriented changes.

## Issues and Support

- use GitHub issues for bugs, docs gaps, and feature requests
- include sanitized CLI status/diagnostic output when reporting install, auth, or synchronization problems
- do not post private tokens, raw transcripts, or local paths in public issues

## Pull Request Bar

Changes that affect install, publish, release, or docs should leave the repo in a state where:

- public requirements are explicit
- user docs distinguish implemented candidate behavior, published release availability and unverified external gates
- release docs do not hardcode stale versions
- the docs checker still passes
