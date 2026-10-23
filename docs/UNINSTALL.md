# Uninstall

With a verified candidate installed:

```sh
node .agent-badge/run.cjs uninstall --json
```

Uninstall first removes validated owned private activation, then asks the owning Git-hook and provider-integration APIs to restore delegates and remove exact owned entries. It removes a strict owned interrupted `setup-intent.json` even when first setup never activated. It does not grant itself ownership of arbitrary files or settings. Existing provider settings/groups, user hook bytes/mode and same-directory delegates are preserved.

Edited wrappers/entries, unknown ownership, a third state in interrupted provider snapshots or an active/unknown integration lease require action. Automation can be deactivated while cleanup remains incomplete; JSON reports `deactivated` independently from static `unresolved` codes and returns nonzero. Preserve the ownership/pending evidence and reconcile locally before retrying. Provider removal acquires its own integration lease; no nested lease is needed.

Defaults retain the unsynced private journal, source-free controls, checkpoints, accepted history, unknown files, installed inert runtime cache and remote ledger. There are no remote purge or destructive compatibility flags. Exact owned tracked setup files can be removed; edited files and the README text remain for deliberate user review. The user's index is never rewritten or staged. Retained unsupported v1 private state/cache/log files remain ignored, including by `git add --dry-run .`.

Deleting tracked `.agent-badge` files alone does **not** deactivate already approved integration on older branches: a common directory may reuse its private runtime when the branch has no declaration. Use explicit uninstall to revoke that approval and owned automation. Other clones remain independently activated; shared remote history remains.

[Recovery](RECOVERY.md) · [Privacy](PRIVACY.md).
