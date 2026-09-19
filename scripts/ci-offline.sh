#!/usr/bin/env bash
set -euo pipefail
# Caller must isolate the network (CI uses Linux unshare --net) and install dependencies first.
export NODE_OPTIONS="--require=$PWD/scripts/deny-network.cjs ${NODE_OPTIONS:-}"
npm run files:verify
npm test
npm run typecheck
npm run core:verify
npm run build:contracts
npm run snapshot:verify
npm run data:verify
npm run reproduce -- --steps 2 --out results/linux-full
npm run result:verify -- results/linux-full/report.json
npm run reproduce -- --save-partial-and-exit --out results/linux-partial
npm run reproduce -- --resume results/linux-partial/report.json --out results/linux-resumed
npm run result:verify -- results/linux-resumed/report.json
