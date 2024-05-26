check: test lint

watch:
  RUST_LOG="watchexec_cli=ERROR" watchexec just check

lint:
  deno lint

test:
  deno test --allow-all
  tsc --build ./browser/tsconfig.json

serve *ARGS:
  deno run --allow-all ./server/main.ts {{ARGS}}
