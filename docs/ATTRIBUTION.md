# Attribution Model

`agent-badge` attributes sessions conservatively so totals stay credible.

## Evidence Priority

The attribution engine applies evidence in this strict order:

`exact repo root -> exact remote -> normalized cwd -> transcript correlation -> persisted override`

The important part is not the number of signals. It is the order. Strong evidence gets first say. Weak hints do not get to inflate the badge.

## Session Outcomes

Every scanned session lands in one of three buckets:

- `included`: strong enough evidence says it belongs to this repo
- `ambiguous`: there is some signal, but not enough to trust it automatically
- `excluded`: the session clearly does not belong to this repo

Sessions that do not clear the threshold remain ambiguous and stay out of the badge until you explicitly include them.

## Manual Overrides

Use these flags on a full scan when you want to resolve ambiguity:

```bash
agent-badge scan --include-session <provider:sessionId>
agent-badge scan --exclude-session <provider:sessionId>
```

Those decisions are persisted and reused on future scans and refreshes.

## Why This Matters

- Strong signals are preferred over weak hints.
- Ambiguous sessions are never auto-counted.
- Manual include/exclude decisions are persisted and reused on future scans.

The badge is allowed to undercount. It is not allowed to bluff.
