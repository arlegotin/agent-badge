# Agent Badge 2.0.1 release status

Stable **2.0.1** was published on 2026-10-23 under explicit user authorization.
All three public packages are on `latest`: `@legotin/agent-badge-core`,
`@legotin/agent-badge`, and `create-agent-badge`.

```sh
npm init agent-badge@latest
```

The [2.0.1 release record](releases/2.0.1/README.md) binds the gold presentation,
plain values, configurable colors and repository-homepage links to exact source
`d821dd4bb529e0e8f02cacc0b44fd31e19c058a5`, tag `v2.0.1`, retained candidate,
independent review and public verification. This repo's explicit runtime and
presentation upgrade preserved every immutable usage record.

- Required [main CI](https://github.com/arlegotin/agent-badge/actions/runs/39952632318)
  passed all six cells. Linux/macOS each passed 861 tests with one existing opt-in
  namespace skip; Windows each passed 41 platform tests and installed initializer
  exit 3/no-write verification. All cells checked the same retained package bytes.
- [Publication](https://github.com/arlegotin/agent-badge/actions/runs/39953986570/attempts/4)
  completed through existing trusted publishers. Each accepted upload was verified
  publicly before resuming. Final confirmation skipped all three with zero npm
  writes. No duplicate upload, repack, overwrite, unpublish or retag was used.
- Public versions, latest tags, sizes/SHA-512 and provenance subjects/source/workflow
  match. A fresh public initializer check resolved the exact graph and displayed
  help without setup writes; npm verified six registry signatures and four
  attestations.
- The live badge is gold, uses plain token text and links to the repo homepage.
  Status reported zero queued uploads; doctor passed all seven required checks.
  Coverage remains partial, and native project trust was not changed.

Node's existing SQLite experimental warnings remain in the logs. The previous
main's macOS/Node 26 timing failure is preserved; the new exact-main matrix passed
without relaxing its assertion.

Linux/macOS execution is supported. Native Windows requires both Badge and the
coding agent inside Linux/WSL2; no separate WSL2 execution result is claimed.
Unverified native amounts remain omitted, and private badge rendering is
unverified. Existing Minor N1 can leave private transport resources after forcibly
killed remote diagnostics. The historical 250 ms optimization goal is unmet; the
two-second automatic limit remains. V1 has no automatic migration.

The [2.0.0 record](releases/2.0.0/README.md), earlier
[verification](RELEASE-VERIFICATION.md) and
[refactor review](reviews/2026-10-23-repo-native/README.md) retain their original
scope and evidence.
