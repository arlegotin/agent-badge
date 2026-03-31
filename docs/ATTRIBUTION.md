# Attribution Model

`agent-badge` attributes sessions conservatively so totals stay credible.

## Evidence Priority

The attribution engine applies evidence in this strict order:

`exact repo root -> exact remote -> normalized cwd -> transcript correlation -> persisted override`

Sessions that do not clear the threshold remain ambiguous and are excluded until you explicitly include them.

## Why This Matters

- Strong signals are preferred over weak hints.
- Ambiguous sessions are never auto-counted.
- Manual include/exclude decisions are persisted and reused on future scans.
