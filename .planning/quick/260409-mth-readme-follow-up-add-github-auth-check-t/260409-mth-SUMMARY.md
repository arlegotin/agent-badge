# Quick Task 260409-mth Summary

## Goal

Make the README quick path explicit about GitHub auth readiness so users do not miss a shell-level prerequisite before expecting live publish to work immediately.

## Completed Tasks

### 1) Update the README quick path

- Updated [README.md](/Volumes/git/legotin/agent-badge/README.md) so the `Do this in each repo:` block now includes `gh auth token >/dev/null` before `npm init agent-badge@latest`.
- Tightened the quick-path sentence so it now reflects the actual short flow: shared runtime once per machine, then confirm GitHub auth in the current shell and run init in the repo.
- Commit: `42987c9`

### 2) Lock the guidance into the docs gate

- Updated [scripts/verify-docs.sh](/Volumes/git/legotin/agent-badge/scripts/verify-docs.sh) so the README quick path must keep the GitHub auth check.
- Verified the docs gate still passes after the wording change.
- Commit: `42987c9`

## Verification

- `npm run docs:check`

## Notes

- No runtime code changed.
- `ROADMAP.md` was not modified.
