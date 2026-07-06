// slides-templates unit build — zip each committed `decks/<name>.canvas/`
// directory into `out/<name>.canvas.zip` plus an `out/index.json` listing.
//
// The zip is TRANSPORT ONLY: the `.canvas` directory contract (dotcanvas) is
// carried verbatim inside the archive; the client unzips in-memory and reads
// it through dotcanvas's normal fs port. Output is DETERMINISTIC — entries
// sorted by name, mtime pinned, fixed level — so repeated builds are
// byte-identical (turbo-cacheable, diff-quiet).

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const unit = path.dirname(fileURLToPath(import.meta.url));
const decksDir = path.join(unit, "decks");
const outDir = path.join(unit, "out");

// Pinned mtime for every zip entry (fflate would default to build time).
const EPOCH = new Date("2000-01-01T00:00:00Z");

const decks = (await fs.readdir(decksDir))
  .filter((n) => n.endsWith(".canvas"))
  .sort();
await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir);

for (const deck of decks) {
  const dir = path.join(decksDir, deck);
  const files = (await fs.readdir(dir)).filter((n) => n !== ".DS_Store").sort();
  const entries = {};
  for (const name of files) {
    entries[name] = [
      new Uint8Array(await fs.readFile(path.join(dir, name))),
      { mtime: EPOCH },
    ];
  }
  const zip = zipSync(entries, { level: 9, mtime: EPOCH });
  await fs.writeFile(path.join(outDir, `${deck}.zip`), zip);
}

await fs.writeFile(
  path.join(outDir, "index.json"),
  JSON.stringify(
    decks.map((d) => `${d}.zip`),
    null,
    2
  ) + "\n"
);
console.log(`slides-templates: ${decks.length} bundles → out/`);
