import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repository = fileURLToPath(new URL("../../", import.meta.url));
export const baselinePath = new URL("./baseline.json", import.meta.url);
export const buildRecord = path.join(
  repository,
  "target/conformance/typescript.json"
);

export async function fingerprint(files, root = repository) {
  const hash = createHash("sha256");
  for (const file of [...files].sort()) {
    const bytes = await readFile(path.join(root, file));
    hash
      .update(file)
      .update("\0")
      .update(String(bytes.length))
      .update("\0")
      .update(bytes);
  }
  return hash.digest("hex");
}

export const referenceRoot = path.join(
  repository,
  "target/conformance/reference"
);
export async function referenceFiles(baseline) {
  return execFileSync(
    "git",
    [
      "ls-tree",
      "-r",
      "--name-only",
      "-z",
      baseline.revision,
      "--",
      ...baseline.paths,
    ],
    { cwd: repository, encoding: "utf8" }
  )
    .split("\0")
    .filter(Boolean);
}
export async function verifyBaseline() {
  const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
  const files = await referenceFiles(baseline);
  assert.equal(
    await fingerprint(files, referenceRoot),
    baseline.sha256,
    "Pinned TypeScript reference changed. Recreate it with prepare.mjs; intentional contract updates require a reviewed revision and digest."
  );
  return baseline;
}

export async function bundleFingerprint(root = referenceRoot, baseline) {
  baseline ??= JSON.parse(await readFile(baselinePath, "utf8"));
  const directories = baseline.paths.filter((entry) =>
    /^packages\/[^/]+$/.test(entry)
  );
  assert(directories.length > 0, "No pinned workspace packages.");
  const manifests = await Promise.all(
    directories.map(async (directory) => ({
      directory,
      manifest: JSON.parse(
        await readFile(path.join(root, directory, "package.json"), "utf8")
      ),
    }))
  );
  const names = new Set(manifests.map(({ manifest }) => manifest.name));
  assert.equal(names.size, manifests.length, "Duplicate pinned package name.");
  const files = [];
  const visit = async (directory) => {
    assert((await lstat(path.join(root, directory))).isDirectory());
    for (const entry of await readdir(path.join(root, directory), {
      withFileTypes: true,
    })) {
      const filename = `${directory}/${entry.name}`;
      if (entry.isDirectory()) await visit(filename);
      else {
        assert(
          entry.isFile(),
          "Reference dist must contain only regular files."
        );
        files.push(filename);
      }
    }
  };
  const runtimeEntries = (value) => {
    if (typeof value === "string") return [value];
    if (value === null || value === undefined) return [];
    return Object.entries(value)
      .filter(([condition]) => condition !== "types")
      .flatMap(([, entry]) => runtimeEntries(entry));
  };
  for (const { directory, manifest } of manifests) {
    for (const group of [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
      "peerDependencies",
    ]) {
      for (const [name, version] of Object.entries(manifest[group] ?? {})) {
        if (version.startsWith("workspace:"))
          assert(names.has(name), `Unpinned workspace dependency: ${name}`);
      }
    }
    // The catalogue runners load CJS entries directly, and those entries load
    // sibling chunks and other workspace packages. Capture each complete dist
    // tree, including runtime assets, rather than guessing a JavaScript suffix.
    await visit(`${directory}/dist`);
    const entries = [
      manifest.main,
      manifest.module,
      manifest.bin,
      manifest.exports,
    ].flatMap(runtimeEntries);
    assert(entries.length > 0, `Missing runtime entrypoints: ${directory}`);
    for (const entry of entries) {
      assert(
        entry.startsWith("./dist/") &&
          !entry.includes("\\") &&
          path.posix.normalize(entry) === entry.slice(2) &&
          files.includes(`${directory}/${entry.slice(2)}`),
        `Build the pinned runtime entrypoint first: ${directory}/${entry}`
      );
    }
  }
  return fingerprint(files, root);
}

export async function verifyBundle(record, root = referenceRoot, baseline) {
  assert.equal(
    record.bundle_sha256,
    await bundleFingerprint(root, baseline),
    "TypeScript bundle changed. Run scripts/conformance/prepare.mjs."
  );
}

export async function verifyBuild() {
  const baseline = await verifyBaseline();
  const record = JSON.parse(await readFile(buildRecord, "utf8"));
  assert.equal(
    record.source_sha256,
    baseline.sha256,
    "Rebuild the TypeScript reference after baseline review."
  );
  await verifyBundle(record, referenceRoot, baseline);
  return baseline;
}
