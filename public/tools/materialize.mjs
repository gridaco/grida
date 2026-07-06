// Materialize the resolved manifest into a host directory (see ../README.md).
//
// Hosts consume `.dist/manifest.json` — never the tree itself. Guards make the
// copy safe against the one silent failure mode of a two-owner URL space:
//   - never overwrite a git-tracked file in the target,
//   - no path escape out of the target root,
//   - every written path must be gitignored on the host side (so the synced
//     tree can never be committed by accident).

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { MANIFEST_PATH, PublishError } from "./resolve.mjs";

const exec = promisify(execFile);

async function gitToplevel(dir) {
  return exec("git", ["-C", dir, "rev-parse", "--show-toplevel"]).then(
    ({ stdout }) => stdout.trim(),
    () => null
  );
}

/** Copy every manifest entry to `<target><url>`. Returns the written paths. */
export async function materialize(root, target) {
  const manifestFile = path.join(root, MANIFEST_PATH);
  const { entries } = JSON.parse(
    await fs.readFile(manifestFile, "utf8").catch(() => {
      throw new PublishError(`missing ${MANIFEST_PATH} — run \`build\` first`);
    })
  );

  // realpath so relative paths agree with git's toplevel (e.g. macOS /var → /private/var)
  await fs.mkdir(path.resolve(target), { recursive: true });
  const targetRoot = await fs.realpath(path.resolve(target));
  const writes = entries.map((e) => {
    const dest = path.resolve(targetRoot, "." + e.url);
    if (dest !== targetRoot && !dest.startsWith(targetRoot + path.sep))
      throw new PublishError(`entry "${e.url}" escapes the target root`);
    return { ...e, dest };
  });

  const repo = await gitToplevel(targetRoot);
  if (!repo) {
    // The overwrite/gitignore guards below are git-derived, so they can't run
    // for a target outside a git working tree. Real hosts (the editor's
    // `public/`) always are, so this is a degenerate case — but never skip the
    // guards *silently*: a caller pointing at an ad-hoc dir must be told the
    // safety net is off before we copy over whatever is there.
    console.warn(
      `public: WARNING — target "${target}" is not inside a git repository; ` +
        `overwrite-protection and gitignore guards are DISABLED for this sync.`
    );
  }
  if (repo) {
    const rel = writes.map((w) => path.relative(repo, w.dest));
    // (a) Refuse to clobber anything git-tracked in the host.
    const { stdout: tracked } = await exec("git", [
      "-C",
      repo,
      "ls-files",
      "-z",
      "--",
      ...rel,
    ]);
    const hits = tracked.split("\0").filter(Boolean);
    if (hits.length > 0)
      throw new PublishError(
        `refusing to overwrite git-tracked host files:\n  ${hits.join("\n  ")}`
      );
    // (b) Every synced path must be ignored on the host, or it could be committed.
    // check-ignore exits 1 when some paths are not ignored — that's data, not an error.
    const { stdout: ignoredOut } = await exec("git", [
      "-C",
      repo,
      "check-ignore",
      "--",
      ...rel,
    ]).catch((err) =>
      err.code === 1 ? { stdout: err.stdout ?? "" } : Promise.reject(err)
    );
    const ignoredSet = new Set(ignoredOut.split("\n").filter(Boolean));
    const missing = rel.filter((r) => !ignoredSet.has(r));
    if (missing.length > 0) {
      const prefixes = [
        ...new Set(writes.map((w) => "/" + w.url.split("/")[1] + "/")),
      ].sort();
      throw new PublishError(
        `synced paths are not gitignored on the host:\n  ${missing.join("\n  ")}\n` +
          `add to the host .gitignore: ${prefixes.join(" ")}`
      );
    }
  }

  for (const w of writes) {
    await fs.mkdir(path.dirname(w.dest), { recursive: true });
    await fs.copyFile(path.join(root, w.unit, w.src), w.dest);
  }
  return writes.map((w) => w.dest);
}
