# Security Policy

If you believe you found a security, privacy, or credential-handling issue in `agent-badge`, do not include exploit details, tokens, or private transcript data in a public issue.

## Reporting

- use GitHub's private vulnerability reporting flow if it is enabled for this repository
- if private reporting is unavailable, open a minimal public issue requesting a private contact path without posting sensitive details

## Scope

Security-relevant reports include:

- accidental publication of prompts, transcripts, filenames, or local paths
- incorrect gist ownership or auth handling
- unsafe deletion or overwrite behavior
- secrets exposure in logs or command output

Please include:

- the affected version
- the command you ran
- a sanitized reproduction
- whether the issue affects local state, published gist content, or both
