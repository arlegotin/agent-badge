# Badge presentation correction

The user requested gold like the original badge, more colors in the examples,
plain token/money values without `known` or `~`, and a README badge that links to
the repository instead of the data branch. Implementation is authorized directly;
the session also authorizes collecting/pushing this repository's sanitized usage
and completing the release. No new accounting or provider behavior is requested.

## Visible result

- Default right-panel color is the original `#E8A515`. The label panel stays gray.
  Value text must remain readable on light colors.
- Optional `policy.badge.color` accepts exactly six-digit `#RRGGBB` colors, case
  insensitive, with no parser default injected into existing policy objects.
  A color in accepted metadata requires presentationVersion 2; don't silently
  accept a color that the old presentation would ignore.
- Numeric badge values are `86.3M tokens` and `$38.42`, including partial totals.
  No badge value, title, or accessible label adds `known` or `~`. Observed zero
  remains `0 tokens`/`$0`; wholly unavailable values use `— tokens`/`$—`.
- Six illustrative gallery colors: gold `#E8A515`, red `#DC2626`, blue `#2563EB`,
  purple `#7C3AED`, pink `#DB2777`, teal `#0F766E`. All show plain numeric values.
  Replace partial.svg/unknown-cost.svg with tokens-pink.svg/cost-teal.svg examples.
- README's managed badge targets the canonical repository homepage. Remove the
  extra data/coverage link. Its SVG still comes from the repository data branch.
  Setup must generate this behavior for every GitHub repo, not hardcode this repo.
- Keep the human README voice and existing honest support/estimate explanations;
  don't put accounting qualifiers back on the badge face or add a warning wall.

## Preserve accepted data

Current v2.0.0 validates all derived file bytes by regenerating them. Changing its
renderer without a format marker would make already accepted history unreadable.
Add optional `LedgerMeta.presentationVersion: 2`; absence selects the exact v2.0.0
presentation. New setup initializes version 2. New rendering is gold/plain;
unmarked existing trees must retain their exact old SVG bytes when validated.
Freeze a small synthetic v2.0.0 tree before edits and test exact old-tree acceptance
plus continued tamper rejection. This compatibility is only for accepted v2 data,
not the removed Gist architecture. Never copy real provider data into fixtures.

Preserve record schemas, immutable record identities and bytes, token totals,
price math, unknown/partial coverage fields, causal controls and strict tree
validation. The human report and machine fields can retain their accounting
terminology. A presentation change must not erase or fabricate usage. The root
will explicitly upgrade the deployed runtime before promoting its accepted
metadata to presentation version 2 through normal configure revision checks.

## Patch deployment

Prepare all three public packages at exact `2.0.1` with exact internal pins using
pinned Changesets 2.30.0; keep testkit private at 0.0.0. Preserve old changelogs and
release evidence. Extend the existing trusted publisher only for exact 2.0.1 with
explicit `stable-patch` intent, including its trusted inline guard and tests.
Do not broaden it to arbitrary versions or weaken main/tag/artifact/SRI checks.
No new dependency or platform-support change is required.

After independent review and successful exact-main CI, publish only the retained
candidate bytes through the existing hosted OIDC workflow. Reconcile npm processing
delays using exact bytes and tags before any resume. Then approve the public 2.0.1
runtime in this repo and update only its presentation metadata/color through the
supported configure path. Preserve all existing records, native hook trust rules,
private Node/tooling, user Git state and the refactor branch.
