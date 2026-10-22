# Fork contribution workflow follow-up — 2026-10-22

Read-only official GitHub documentation; no hosted changes or credentials.

- [Triggering a workflow](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow): a push made with GITHUB_TOKEN ordinarily does not start another push workflow. Current exceptions for dispatch and approval-gated PR activities do not make a chained data-branch push renderer reliable. Keep accepted import, reduction and render in one transaction/job. Manual reconciliation covers missed triggering; schedule is an explicit option.
- [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use): immutable action pins use full commit SHAs verified against the action origin; passing untrusted expressions through environment variables avoids embedding them in shell source. Pin the badge release/runtime too, not only checkout/setup actions.
- [Securely using pull_request_target](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target): executing fork checkout code under a privileged base workflow is unsafe. Use accepted default-branch files as data and trusted pinned importer code. Do not invoke root package lifecycle scripts or tracked mutable launchers as the importer.

Implementation implications (judgment): discover actual default branch rather than hardcode main in generated user-repository workflow; exclude data-branch writes from collection trigger. Dispatch from a nondefault branch must fail before import/write. Limit write permission to the importing job; fork PR runs receive no write authority. Inputs are strict bounded immutable-digest envelopes; reject symlinks/path traversal/executable entries, UUID/schema/hash mismatch. Keep contributor staging explicit. Verify selected bytes rather than reread a mutable pathname after validating it. Local fixture Git repositories can test merge acceptance, changed file and transaction behavior; hosted policy/private rendering remains unverified.

## Verified immutable action pins

Public GitHub tag metadata fetched without authentication after browser API cache/access failure:

- actions/checkout v6 -> `d23441a48e516b6c34aea4fa41551a30e30af803`, type commit. [Origin tag API](https://api.github.com/repos/actions/checkout/git/ref/tags/v6); [pinned action.yml](https://github.com/actions/checkout/blob/d23441a48e516b6c34aea4fa41551a30e30af803/action.yml). action runtime Node24; persist-credentials input defaults true. Set deliberately for the trusted importer design; do not inadvertently run user hooks/configured credentials from untrusted checkout code.
- actions/setup-node v6 -> `249970729cb0ef3589644e2896645e5dc5ba9c38`, type commit. [Origin tag API](https://api.github.com/repos/actions/setup-node/git/ref/tags/v6); [pinned action.yml](https://github.com/actions/setup-node/blob/249970729cb0ef3589644e2896645e5dc5ba9c38/action.yml). action runtime Node24; package-manager-cache defaults true based on root package.json packageManager metadata. Generated importer should set package-manager-cache:false, since it installs trusted pinned Badge code separately and must also work in non-Node repositories. Select target node-version explicitly rather than reading the repository's version file.

These were read-only public metadata/source fetches via scoped approved network access. No repository settings, account state or token was inspected. Pins are fixed verified origins, not broad claims every v6 patch was tested. Task18 may reuse these exact verified pins for CI/release where appropriate.

## Generated workflow byte bound
[GitHub Actions limits](https://docs.github.com/en/actions/reference/limits) currently caps each workflow file at500KB; largerfiles do not start runs. Task15 measured198221-byte syntheticlock to266842-byte workflow. BoundthecompletegeneratedUTF8output conservativelyat500000bytes andfailwithactionableerror ratherthan write a nonrunningworkflow. Embeddeddata should not becomea hugeexternalprocessargument/environmentvariable; builtinprintf/stdin orfiledata avoids thoseOSlimits. Sourceverified2026-10-22.
