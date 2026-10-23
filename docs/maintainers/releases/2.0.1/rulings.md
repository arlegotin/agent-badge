# Presentation patch decisions

Ruling: Add explicit presentationVersion2, with absence retaining exact2.0.0 derived bytes — current validator regenerates every artifact, so a cosmetic renderer replacement would otherwise invalidate accepted history — cost if wrong: metadata-format upkeep and an explicit runtime/metadata upgrade for existing installations; no raw record migration or weaker validation is allowed.

Ruling: Ship exact2.0.1 through existing retained-byte publisher, extending only the exact stable-patch allowlist — installed2.0.0 cannot safely produce/validate the requested new view and source-only edits would not fix the live badge — cost if wrong: patch-release verification time and explicit approved runtime update, without expanding arbitrary-version publication.

Ruling: Final source tests run in a fresh source copy with separate .git, not the activated checkout or linked worktree — test default-cwd code must not encounter real private activation even with empty HOME/provider roots — cost if wrong: temporary-copy setup and dependency overlay work, but no production or history change.
