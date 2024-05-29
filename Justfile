check: test lint

watch:
  RUST_LOG="watchexec_cli=ERROR" watchexec just check

lint:
  deno lint
  ./tools/determinismLint.ts

test:
  deno test --allow-all
  tsc --build ./browser/tsconfig.json
  deno check test/real/main.ts

serve:
  DOC_PATH="./server/.dev_db/serve" \
    deno run --allow-all --unstable-kv ./server/main.ts

live-playground:
  #!/usr/bin/env bash

  dbDir="./server/.dev_db"

  prometheus \
    --config.file infra/dev/prometheus.yaml \
    --storage.tsdb.path "$dbDir/prom" \
    >/dev/null 2>/dev/null &
  promPid=$!

  mkdir -p $dbDir
  RUST_LOG="watchexec_cli=ERROR" watchexec --restart -w ./core -w ./server --exts ts \
    PORT=4032 DOC_PATH="$dbDir/playground" \
    deno run --allow-all --unstable-kv ./server/main.ts &
  serverPid=$!

  pushd ./playground
  npm run dev &
  playgroundPid=$!
  popd

  trap "kill $serverPid $playgroundPid $promPid && reset" INT TERM
  sleep 1 && open -a "Google Chrome" "http://localhost:9090" "http://localhost:3000/local"
  wait $serverPid $playgroundPid $promPid

loc:
  tokei -t=typescript,tsx
