#!/usr/bin/env node
/**
 * Docs sources (docs/wg/platform/docs-sources.md).
 *
 *   cli.js status                      pinned vs wanted ref per source
 *   cli.js sync [id…] [--ref <ref>]    move pins (all, or some sources)
 *   cli.js verify                      what a site PR must pass
 *   cli.js check --repo <owner/name> --dir <path>
 *                                      what a source PR must pass (its CI)
 *
 * `--local <owner/name>=<dir>` (or DOCS_SOURCES_LOCAL) reads a local clone
 * instead of GitHub. A pin made from it must exist upstream.
 */
const sources = require(".");

const [command, ...rest] = process.argv.slice(2);
const ids = [];
const local = {};
const opts = {};
for (let i = 0; i < rest.length; i++) {
  const arg = rest[i];
  if (arg === "--local") {
    const [repo, dir] = rest[++i].split("=");
    local[repo] = dir;
  } else if (arg.startsWith("--")) opts[arg.slice(2)] = rest[++i];
  else ids.push(arg);
}

function report(problems, ok) {
  if (problems.length) {
    console.error("[sources] the source rules fail:");
    for (const p of problems) console.error(`  - ${p}`);
    console.error("[sources] see docs/wg/platform/docs-sources.md");
    process.exit(1);
  }
  console.log(`[sources] ${ok}`);
}

try {
  switch (command) {
    case "status": {
      const lock = sources.read_lock();
      for (const [id, source] of Object.entries(
        sources.read_manifest().sources
      )) {
        const { ref } = sources.wanted_ref(source);
        const pin = lock[id]
          ? `${lock[id].ref} @ ${lock[id].commit.slice(0, 12)}`
          : "not pinned";
        console.log(`${id}\t${source.repo}\twants ${ref}\tpinned ${pin}`);
      }
      break;
    }
    case "sync":
      sources.sync({ ids, ref: opts.ref, local });
      break;
    case "verify":
      report(sources.verify({ local }), "every pin passes");
      break;
    case "check":
      if (!opts.repo || !opts.dir)
        throw new Error("check needs --repo and --dir");
      report(
        sources.check({ repo: opts.repo, dir: opts.dir }),
        `${opts.repo} passes the source rules`
      );
      break;
    default:
      console.error("usage: cli.js <status|sync|verify|check> …");
      process.exit(2);
  }
} catch (e) {
  console.error(`[sources] ${e.message}`);
  process.exit(1);
}
