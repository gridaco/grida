import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CliRelease } from "./prepare.mjs";

const manifest = () => ({
  name: "grida",
  version: "1.0.0",
  private: false,
  type: "module",
  bin: { grida: "./dist/bin.mjs" },
  engines: { node: ">=24.0.0" },
  license: "Apache-2.0",
  repository: "https://github.com/gridaco/grida",
  optionalDependencies: { "@github/keytar": "7.10.6" },
  files: ["dist", "THIRD-PARTY-NOTICES.txt"],
  scripts: { build: "tsdown", test: "vitest run", typecheck: "tsc --noEmit" },
});
const files = () =>
  [
    "package.json",
    "README.md",
    "LICENSE",
    "THIRD-PARTY-NOTICES.txt",
    "dist/bin.mjs",
    "dist/media-example.mjs",
  ].map((path) => ({ path }));

test("release guard refuses private/placeholder/mismatched/unreviewed package releases", () => {
  CliRelease.release(manifest(), "1.0.0", "next");
  CliRelease.release(
    { ...manifest(), version: "1.0.0-rc.1" },
    "1.0.0-rc.1",
    "next"
  );
  for (const [value, version, tag] of [
    [{ ...manifest(), private: true }, "1.0.0", "next"],
    [{ ...manifest(), version: "0.0.0" }, "0.0.0", "next"],
    [manifest(), "1.0.1", "next"],
    [manifest(), "1.0.0", "custom"],
    [{ ...manifest(), version: "1.0.0-rc.1" }, "1.0.0-rc.1", "latest"],
    [{ ...manifest(), version: "1.0.0-01" }, "1.0.0-01", "next"],
    [
      { ...manifest(), dependencies: { "@grida/ai": "workspace:*" } },
      "1.0.0",
      "next",
    ],
    [{ ...manifest(), peerDependencies: { electron: "*" } }, "1.0.0", "next"],
    [
      {
        ...manifest(),
        scripts: { ...manifest().scripts, postinstall: "node dist/bin.mjs" },
      },
      "1.0.0",
      "next",
    ],
    [
      { ...manifest(), optionalDependencies: { "@github/keytar": "latest" } },
      "1.0.0",
      "next",
    ],
  ])
    assert.throws(() => CliRelease.release(value, version, tag));
});

test("tarball must contain entry, README and license, with no source, secrets, maps or traversal", () => {
  CliRelease.files(files());
  for (const path of [
    ".env",
    "credentials.toml",
    "src/bin.ts",
    "dist/bin.mjs.map",
    "dist/../../secret.mjs",
    "README.md",
  ])
    assert.throws(() => CliRelease.files([...files(), { path }]));
  for (const required of [
    "package.json",
    "README.md",
    "LICENSE",
    "THIRD-PARTY-NOTICES.txt",
    "dist/bin.mjs",
  ])
    assert.throws(() =>
      CliRelease.files(files().filter(({ path }) => path !== required))
    );
});

test("Changesets version planning ignores the independently versioned CLI", async () => {
  const config = JSON.parse(
    await readFile(
      new URL("../../.changeset/config.json", import.meta.url),
      "utf8"
    )
  );
  assert(config.ignore.includes("grida"));
});

test("built candidate verifies outside the repository and rejects changed archive bytes", async () => {
  const owned = await mkdtemp(path.join(tmpdir(), "grida-release-test-"));
  const out = path.join(owned, "candidate");
  try {
    const report = await CliRelease.prepare(out);
    assert.deepEqual(await CliRelease.verify(out), report);
    await assert.rejects(CliRelease.prepare(out), { code: "EEXIST" });
    assert.deepEqual(
      await CliRelease.verify(out),
      report,
      "Refused preparation must preserve the existing candidate"
    );
    const archive = path.join(out, report.archive);
    const changed = await readFile(archive);
    changed[changed.length - 1] ^= 1;
    await writeFile(archive, changed);
    await assert.rejects(CliRelease.verify(out), /Candidate hash changed/);
  } finally {
    await rm(owned, { recursive: true, force: true });
  }
});
