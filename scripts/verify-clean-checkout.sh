#!/usr/bin/env bash
set -euo pipefail
# Retained candidate + separately acquired dependency closure. No destructive dist cleanup/repacking.
exec node scripts/validation/run-isolated.mjs node scripts/validation/verify-clean-checkout.mjs "$@"
