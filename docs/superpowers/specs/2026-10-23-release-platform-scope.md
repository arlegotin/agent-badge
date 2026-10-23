# Stable v2 native platform scope

Status: release execution decision under the user's request to do what is needed
to release and their preference for minimum risk. This amends the previously
unverified native-Windows manual scope; it does not claim the user requested a
Windows feature removal.

## Evidence and choice

Hosted PR run39929706703 exposed a checkout LF/CRLF license mismatch, now corrected
without weakening exact artifact validation. Run39931707158 then passed full
Linux and macOS validation on Node24/26, while native Windows reached initial
setup and returned an unexpected failure. Controlled credential-free Windows
diagnosis in run39932491268 proves `EPERM` at directory `fsync` in setup atomic
publication. Core journal/index/lock persistence uses the same directory-sync
contract. Native Windows manual operation was never verified successfully.

Three approaches were considered:

1. Implement and certify a separate Windows durable-storage port before v2.
   This requires platform-specific crash/recovery and permission work beyond the
   reviewed POSIX design, and postpones a working Linux/macOS release.
2. Ignore directory-sync errors on Windows. Rejected: that would silently weaken
   the accepted durability contract and could claim success for unflushed state.
3. Release the verified Linux/macOS implementation and explicitly reject native
   Windows actions before repository discovery, installation, or writes. Chosen
   for minimum risk. Windows users can run both Badge and the agent in a Linux
   environment such as WSL2; this is Linux execution, not native Windows support.

## Required behavior

- Public packages remain installable for help/version and platform diagnostics.
  No npm OS metadata prevents the Windows source/package validation job.
- All CLI actions on native Windows return finite `unsupported-platform` JSON
  with exitCode3 (or the same static plaintext guidance), before operational
  imports or writes. Help, version and invalid-argument parsing still work.
- `planSetup` and `applySetup` also reject native Windows before resolution or
  mutation for direct API callers. Core library use on native Windows remains
  unsupported; no storage guarantee is added.
- The repository launcher rejects native Windows setup before reading pins,
  discovering Git or acquiring a runtime. Its help/version metadata path remains.
  Existing automatic wrappers remain failure-soft and direct users to Linux/WSL2.
- Windows smoke must prove the actual installed initializer rejects safely and
  leaves no `.agent-badge` or private activation, alongside exact package-byte
  checks. It must never accept an unrelated setup error as supported behavior.
- POSIX behavior, two-second automatic deadlines, immutable authority and exact
  artifact checks stay intact. No directory fsync exception is introduced.
- Current documentation states Linux/macOS support and native Windows rejection.
  Historical reports/candidate hashes remain historical, with this amendment linked.

Cost: native Windows users need a Linux environment or must wait for a separately
certified port. The unverified manual-support aspiration is withdrawn rather than
presented as delivered. Existing failed synthetic setup state is retained by the
product; the platform gate does not remove files or migrate user data.
