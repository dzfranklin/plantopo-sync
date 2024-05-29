#!/usr/bin/env -S deno run --allow-all --unstable-kv

import { Tracer } from "../server/Tracer.ts";

const tracePath = Deno.args[0];
const outPath = Deno.args[1];

await Deno.mkdir(outPath, { recursive: true });
await Tracer.dump(tracePath, outPath);

console.log("Done");
