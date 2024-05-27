#!/usr/bin/env -S deno run --allow-all

const fileDirname = import.meta.dirname;
if (fileDirname === null) {
  throw new Error("import.meta.dirname is null");
}
const coreDir = Deno.realPathSync(fileDirname + "/../core");

const bannedStrings = [
  "Math.random",
  "crypto.getRandomValues",
  // "new Date()",
  // "Date.now()",
  // "performance.now()",
  // "setTimeout",
  // "setInterval",
];

const dec = new TextDecoder();
const byString = await Promise.all(
  bannedStrings.map(async (bannedString) => {
    const cmd = new Deno.Command("rg", {
      args: [
        "--files-with-matches",
        "--glob=!*.spec.ts",
        "--glob=!platform/*",
        bannedString,
      ],
      stdout: "piped",
      cwd: coreDir,
    });
    const out = await cmd.output();
    const stdout = dec.decode(out.stdout);
    return {
      bannedString,
      files: stdout
        .split("\n")
        .filter((line) => line.length > 0)
        .map((f) => "core/" + f),
    };
  })
);

const byFile = new Map<string, string[]>();
for (const { bannedString, files } of byString) {
  for (const file of files) {
    if (!byFile.has(file)) {
      byFile.set(file, []);
    }
    byFile.get(file)!.push(bannedString);
  }
}

console.log("\nDeterminism check:\n");
for (const [file, bannedStrings] of byFile.entries()) {
  console.log(file);
  for (const bannedString of bannedStrings) {
    console.log(`  ${bannedString}`);
  }
}

if (byFile.size > 0) {
  Deno.exit(1);
}
