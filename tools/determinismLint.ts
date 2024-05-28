#!/usr/bin/env -S deno run --allow-all

const fileDirname = import.meta.dirname;
if (fileDirname === null) {
  throw new Error("import.meta.dirname is null");
}
const coreDir = Deno.realPathSync(fileDirname + "/../core");

const bannedRegexes = [
  "Math.random",
  "crypto.getRandomValues",
  "new Date()",
  "Date.now()",
  "performance.now()",
  "setTimeout",
  "clearTimeout",
  "setInterval",
  "clearInterval",
];

const dec = new TextDecoder();
const byString = await Promise.all(
  bannedRegexes.map(async (bannedRegex) => {
    const cmd = new Deno.Command("rg", {
      args: [
        "--files-with-matches",
        "--glob=!*.spec.ts",
        "--glob=!platform/*",
        bannedRegex,
      ],
      stdout: "piped",
      cwd: coreDir,
    });
    const out = await cmd.output();
    const stdout = dec.decode(out.stdout);
    return {
      bannedRegex,
      files: stdout
        .split("\n")
        .filter((line) => line.length > 0)
        .map((f) => "core/" + f),
    };
  })
);

const byFile = new Map<string, string[]>();
for (const { bannedRegex, files } of byString) {
  for (const file of files) {
    if (!byFile.has(file)) {
      byFile.set(file, []);
    }
    byFile.get(file)!.push(bannedRegex);
  }
}

console.log("\nDeterminism check:");
if (byFile.size === 0) {
  console.log("No banned strings found.");
} else {
  for (const [file, bannedStrings] of byFile.entries()) {
    console.log(file);
    for (const bannedString of bannedStrings) {
      console.log(`  ${bannedString}`);
    }
  }
  Deno.exit(1);
}
