# Git authentication

The replacement uses normal Git authentication for the explicitly approved destination and the `agent-badge/data` branch. Configure your usual credential helper or SSH outside Badge. Badge does not discover, print or store provider credentials or require a Gist token.

Local route consent is not proof of write permission. A repository can have a read-only route or branch rules that reject its data transaction. `doctor --remote` performs bounded read-only validation; it never sends a no-op update, creates a remote object to probe access or proves signing capability. Pending usage survives failed synchronization.

Fork origins that differ from the tracked declaration stay unbound. A writer can explicitly choose `setup --target upstream`; a contributor can use sanitized public envelopes instead. Do not place credentials in repository URLs. The workflow generator supports verified credential-free `github.com` identity only. Hosted workflow permissions remain an external verification gate.

[CLI](CLI.md) · [Privacy](PRIVACY.md) · [Recovery](RECOVERY.md).
