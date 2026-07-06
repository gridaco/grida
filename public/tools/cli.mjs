#!/usr/bin/env node
// CLI for the `public/` origin tree. Three verbs over one artifact:
//   build            run unit builds, validate, write .dist/manifest.json
//   sync --to <dir>  materialize the manifest into a host directory
//   ls               print the URL registry ("what does this repo publish?")

import path from "node:path";
import { fileURLToPath } from "node:url";
import { materialize } from "./materialize.mjs";
import { MANIFEST_PATH, PublishError, resolve } from "./resolve.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [verb, ...args] = process.argv.slice(2);

try {
  if (verb === "build") {
    const entries = await resolve(root, { write: true });
    console.log(`public: ${entries.length} URLs resolved → ${MANIFEST_PATH}`);
  } else if (verb === "sync") {
    const to = args[0] === "--to" ? args[1] : undefined;
    if (!to) throw new PublishError("usage: cli.mjs sync --to <dir>");
    const written = await materialize(root, path.resolve(process.cwd(), to));
    console.log(`public: synced ${written.length} files → ${to}`);
  } else if (verb === "ls") {
    for (const e of await resolve(root))
      console.log(`${e.url}  ←  ${e.unit}/${e.src}`);
  } else {
    console.error("usage: cli.mjs <build | sync --to <dir> | ls>");
    process.exit(2);
  }
} catch (err) {
  if (err instanceof PublishError) {
    console.error(`public: ${err.message}`);
    process.exit(1);
  }
  throw err;
}
