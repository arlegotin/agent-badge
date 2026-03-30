# Changesets

This repository uses Changesets to manage intentional releases across the npm
workspace.

Release flow:

1. Add a changeset when a package-facing change lands.
2. Review aggregated version bumps before publishing.
3. Publish `agent-badge` and `create-agent-badge` from the same workspace flow.
4. Let internal workspace dependency ranges update with patch bumps by default.
