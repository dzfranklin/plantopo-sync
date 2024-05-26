check: test lint

watch:
  RUST_LOG="watchexec_cli=ERROR" watchexec just check

lint:
  deno lint

test:
  deno test --allow-all
  tsc --build ./browser/tsconfig.json

serve:
  deno run --allow-all ./server/main.ts

live-playground:
  #!/usr/bin/env bash

  dbDir="./server/.dev_db"
  mkdir -p $dbDir
  RUST_LOG="watchexec_cli=ERROR" watchexec --restart -w ./core -w ./server --exts ts \
    PORT=4032 DOC_PATH="$dbDir/playground" \
    deno run --allow-all --unstable-kv ./server/main.ts &
  serverPid=$!

  pushd ./playground
  npm run dev &
  playgroundPid=$!
  popd

  trap "kill $serverPid $playgroundPid && reset" INT TERM
  sleep 1 && open "http://localhost:3000/local"
  wait $serverPid $playgroundPid
