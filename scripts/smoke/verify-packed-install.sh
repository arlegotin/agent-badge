#!/usr/bin/env bash
set -euo pipefail
# Compatibility entry point. Consumes retained candidates without packing again.
exec node scripts/smoke/verify-packed-install.mjs "$@"
