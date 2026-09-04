#!/usr/bin/env bash
set -euo pipefail

# Remove outputs for source files that were deleted or renamed.
rm -rf dist

# Compile TypeScript
tsc
