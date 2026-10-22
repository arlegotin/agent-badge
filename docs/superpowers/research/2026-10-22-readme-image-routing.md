# README image routing — 2026-10-22

Official GitHub Markdown docs support SVG image URLs and cross-branch image references: https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#images . Lines285–307 were inspected. They recommend relative links and describe private-image access for certain cross-repository relative examples; this is documentation evidence, not a live test of our dedicated branch route.

The approved design uses a canonical fixed public raw.githubusercontent.com/OWNER/REPO/refs/heads/agent-badge/data/badge.svg URL linked to the same data-branch report. Setup must insert the image, not merely a report link. No credential/publication/hosted-rendering test was run. Unknown/private visibility must not be presented as verified private-image support. Other hosts have no constructed GitHub route.

Task16 consumes this evidence: supported canonical GitHub HTTPS/SSH declarations
receive the fixed Markdown image linked to the data-branch report, with idempotent
managed markers. Other hosts have no guessed image URL. Setup reports
`badge.status: public-route|unsupported-host` and `privateImageSupport: unverified`.
No visibility lookup, credentials, live image fetch, hosted write or publication ran.
