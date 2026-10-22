# Sanitized fork contributions and trusted import

Task 15 implements the fork boundary from the repository-native design. Ordinary
fork activation retains the upstream UUID for local sanitization, but a different
origin leaves automatic publication unbound. A writer may explicitly select
`setup --target upstream`. A standalone fork uses `setup --new-repository
--repository-url https://github.com/owner/fork` in a fresh clone without Badge
private state. Existing activated, accepted or journaled common directories must
use another clone; records are never relabeled. An upstream data branch copied to
a fork still has its upstream UUID, so standalone synchronization reports a
conflict instead of overwriting or reseeding that ledger.

`agent-badge contribute` exports sanitized public records into
`.agent-badge/contributions/<sha256>.json`. The digest covers deterministic envelope
bytes. The tool atomically creates an immutable file and never stages or commits.
The contributor stages this file with their normal PR: this is the explicit
normal-staging exception for forks without upstream write access. Closed and
unmerged PRs do not affect upstream totals.

The public envelope is exactly `kind: agent-badge/contribution`, `schemaVersion: 1`,
`protocolVersion: 1`, `normalizationVersion: 1`, `repositoryId` and `records`, where
each record entry contains only its SHA-256 `hash` and strict sanitized public
`record`. It contains no paths, filenames from agent work, local provenance,
provider request/session IDs, prompts, transcripts or executable entries. It is
separate from the **private** `agent-badge/normalized-source` protocol documented
in the provider capability spec. Public import rejects that private kind.

Envelopes are limited to 10 MiB and 10,000 records, each under the ledger's 256 KiB
public-object limit. Record hashes, repository UUID, schema and normalization are
validated. Selected observations include transitive superseded observations and
all controls for their unit, including correction replacements and causal control
parents. Missing closure is rejected. Accepted upstream controls continue to govern
the union; the importer does not invent a second accounting rule.

`exportContribution({meta, records, selectedHashes?})` is a pure closure builder.
`parseContribution(input)` accepts an unknown object or bounded UTF-8 bytes/string.
`contributionBytes` and `contributionPath` produce deterministic storage bytes/path.
`importContribution(envelope, options)` is asynchronous; options use the existing
repository, bound destination, private store, cancellation and deadline interfaces.
It adds public records to the same sync transaction that unions, reduces, renders,
fast-forward pushes and confirms inclusion. It does not collect sources or initialize
a missing ledger. Only actual local pending hashes are acknowledged in private
storage. Its result includes `retrySource: contribution-envelope` and
`retryRequired`; a queued result is **not** a durable private observation. Keep the
managed local file, or accepted Git blob, and rerun import/reconciliation until
accepted. No fake source metadata or normalized observation is journaled.

Explicit local writers can use `agent-badge import --file <managed-path>`. The reader
opens once without following symlinks, rejects executable/nonregular files, checks
size and digest, and passes the validated snapshot onward. Trusted CI instead uses
`import --accepted-ref <oid> --default-branch <branch> --repository-id <uuid>
--repository-url <url>`. It verifies the bound destination and its actual symbolic
HEAD/default branch, fetches that branch into an owned temporary ref and verifies
selected commit ancestry before reading immutable blobs by object ID. A mutable
local tracking ref cannot establish acceptance. Temporary refs are deleted and
normal code refs/index/worktree are preserved. Unsafe modes, symlinks, nested or
unexpected paths, aggregate byte/count overflow and foreign envelopes fail closed.

`generateContributionWorkflow({repositoryId, repositoryUrl, defaultBranch,
runtimeVersion, pin: {manifest, lock}, schedule?})` asynchronously renders the
shipped `resources/workflows/agent-badge-import.yml` template. The caller supplies
the actual discovered default branch and explicitly approved exact runtime release
and integrity lock; setup wiring is Task 16. The workflow embeds that pin rather
than trusting tracked launchers, root packages or a later changed runtime lock.
It installs outside the checkout with `npm ci --ignore-scripts`, then directly
invokes the installed importer. A release containing this implementation is required;
the old published 1.1.20 package does not provide it. Release/version work is Task 18.

The workflow runs on accepted default-branch contribution pushes and manual dispatch.
Job and shell guards reject another dispatch ref and an actual default-branch mismatch
before installation or write. Checkout and setup-node use verified immutable pins,
Node 24.0.0 is selected explicitly, and package-manager cache inference is disabled.
Top-level permissions are empty; only the importing job receives `contents: write`.
It reads accepted data without executing fork code, repository lifecycle scripts,
tracked launchers or a data-branch script. One shared transaction imports and renders.
Scheduled reconciliation is an explicit generation option, not enabled by default.
The generator rejects output above 500,000 UTF-8 bytes; reduce the pin/input size
before regenerating an oversized workflow. Lock data is a shell literal decoded
through stdin, never a large executable argument or environment variable.
Keep the generated workflow and its embedded release pin under maintainer review.

Workflow decisions follow these official sources, read on 2026-10-22:

- [GitHub Actions limits](https://docs.github.com/en/actions/reference/limits):
  the current workflow file limit is 500 KB. The conservative 500,000-byte generated
  output cap includes embedded exact lock data and all other inputs.
- [Triggering a workflow](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow):
  ordinary `GITHUB_TOKEN` pushes do not trigger another push workflow; rendering must
  occur in the importing transaction. Explicit dispatch/reconciliation covers missed events.
- [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use):
  immutable action commits and shell environment variables keep trust boundaries explicit.
- [Securely using pull_request_target](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target):
  privileged workflows must not execute a fork checkout. This importer uses default-branch
  accepted blobs and separately installed pinned code.
- [Checkout origin tag](https://api.github.com/repos/actions/checkout/git/ref/tags/v6)
  and [pinned action](https://github.com/actions/checkout/blob/d23441a48e516b6c34aea4fa41551a30e30af803/action.yml):
  verified v6 commit `d23441a48e516b6c34aea4fa41551a30e30af803`.
- [Setup-node origin tag](https://api.github.com/repos/actions/setup-node/git/ref/tags/v6)
  and [pinned action](https://github.com/actions/setup-node/blob/249970729cb0ef3589644e2896645e5dc5ba9c38/action.yml):
  verified v6 commit `249970729cb0ef3589644e2896645e5dc5ba9c38`.

Verification uses sanitized envelopes, local bare Git remotes, parsed YAML and local
shell execution with a controlled synthetic package installer. Hosted GitHub token,
branch-protection and repository permission behavior is not verified; a live check
requires an explicitly authorized disposable repository. No upstream write or release
is authorized by this implementation task.
