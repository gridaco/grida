import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";

const execute = promisify(execFile);
const repository = fileURLToPath(new URL("../../", import.meta.url));

/** Package policy shared by candidate preparation and the explicit release guard. */
export const CliRelease = {
  async npm() {
    // Resolve the companion executable rather than assuming nvm's lib layout:
    // Homebrew keeps npm under libexec. Never select an ambient PATH executable.
    const filename = await realpath(
      path.join(path.dirname(process.execPath), "npm")
    );
    assert.equal(
      path.basename(filename),
      "npm-cli.js",
      "Expected the Node installation's npm CLI"
    );
    return filename;
  },
  manifest(value) {
    assert.equal(value.name, "grida", "Unexpected package name");
    assert.equal(value.type, "module", "The CLI must remain an ESM executable");
    assert.deepEqual(
      value.bin,
      { grida: "./dist/bin.mjs" },
      "Unexpected CLI entry"
    );
    assert.equal(
      value.engines?.node,
      ">=24.0.0",
      "Review changes to the supported runtime"
    );
    assert.equal(
      value.license,
      "Apache-2.0",
      "Review changes to package licensing"
    );
    assert.equal(
      value.repository,
      "https://github.com/gridaco/grida",
      "Unexpected source repository"
    );
    assert.deepEqual(
      value.dependencies ?? {},
      {},
      "Runtime dependencies must be bundled"
    );
    assert.deepEqual(
      value.peerDependencies ?? {},
      {},
      "CLI must not depend on consumer workspace packages"
    );
    assert.deepEqual(
      value.optionalDependencies,
      { "@github/keytar": "7.10.6" },
      "Review native dependency changes"
    );
    assert.deepEqual(
      value.files,
      ["dist", "THIRD-PARTY-NOTICES.txt"],
      "Review changes to the package file boundary"
    );
    assert.deepEqual(
      value.scripts,
      { build: "tsdown", test: "vitest run", typecheck: "tsc --noEmit" },
      "Review package lifecycle changes; installed proofs disable scripts"
    );
    return value;
  },

  release(value, version, tag) {
    CliRelease.manifest(value);
    assert.equal(
      value.private,
      false,
      "Release is blocked while grida is private"
    );
    const semver =
      /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
    const match = typeof version === "string" && semver.exec(version);
    assert(
      match && version !== "0.0.0",
      "Choose an explicit release version; 0.0.0 is a development placeholder"
    );
    assert(
      !match[4]
        ?.split(".")
        .some(
          (part) =>
            /^\d+$/.test(part) && part.length > 1 && part.startsWith("0")
        ),
      "Invalid numeric prerelease identifier"
    );
    assert.equal(
      value.version,
      version,
      "Release version must match the reviewed package manifest"
    );
    assert(
      tag === "next" || tag === "latest",
      "Choose next or latest explicitly"
    );
    assert(tag !== "latest" || !match[4], "Prereleases cannot replace latest");
  },

  files(files) {
    const names = files.map(({ path: filename }) => filename);
    assert.equal(
      new Set(names).size,
      names.length,
      "Duplicate packed filename"
    );
    for (const name of [
      "package.json",
      "README.md",
      "LICENSE",
      "THIRD-PARTY-NOTICES.txt",
      "dist/bin.mjs",
    ])
      assert(names.includes(name), `Package is missing ${name}`);
    assert(
      names.every(
        (name) =>
          [
            "package.json",
            "README.md",
            "LICENSE",
            "THIRD-PARTY-NOTICES.txt",
          ].includes(name) || /^dist\/[A-Za-z0-9_-]+\.mjs$/.test(name)
      ),
      "Package contains unreviewed files"
    );
  },

  async prepare(out, release) {
    assert(
      path.isAbsolute(out),
      "Candidate output must be an absolute new directory"
    );
    const source = path.join(repository, "packages/grida-cli");
    const manifest = CliRelease.manifest(
      JSON.parse(await readFile(path.join(source, "package.json"), "utf8"))
    );
    if (release) CliRelease.release(manifest, release.version, release.tag);
    const scratch = await mkdtemp(path.join(tmpdir(), "grida-cli-pack-"));
    let created = false;
    try {
      // npm never sees repository/user .npmrc, credentials, lifecycle scripts or a registry.
      const staging = path.join(scratch, "package");
      await mkdir(staging, { mode: 0o700 });
      for (const name of await readdir(path.join(source, "dist"))) {
        assert(/^[A-Za-z0-9_-]+\.mjs$/.test(name), "Unreviewed dist entry");
        assert(
          (await lstat(path.join(source, "dist", name))).isFile(),
          "Dist must contain regular files only"
        );
      }
      await cp(path.join(source, "dist"), path.join(staging, "dist"), {
        recursive: true,
      });
      for (const name of [
        "package.json",
        "README.md",
        "THIRD-PARTY-NOTICES.txt",
      ])
        await cp(path.join(source, name), path.join(staging, name));
      await cp(path.join(repository, "LICENSE"), path.join(staging, "LICENSE"));
      await writeFile(path.join(scratch, "user.npmrc"), "");
      await writeFile(path.join(scratch, "global.npmrc"), "");
      await mkdir(out, { mode: 0o700 });
      created = true;
      const npm = await CliRelease.npm();
      const packed = await execute(
        process.execPath,
        [
          npm,
          "pack",
          staging,
          "--pack-destination",
          out,
          "--json",
          "--offline",
          "--ignore-scripts",
        ],
        {
          cwd: scratch,
          env: {
            PATH: [path.dirname(process.execPath), "/usr/bin", "/bin"].join(
              path.delimiter
            ),
            HOME: scratch,
            TMPDIR: scratch,
            npm_config_cache: path.join(scratch, "cache"),
            npm_config_userconfig: path.join(scratch, "user.npmrc"),
            npm_config_globalconfig: path.join(scratch, "global.npmrc"),
            npm_config_update_notifier: "false",
          },
          timeout: 60_000,
          maxBuffer: 1024 * 1024,
        }
      );
      const [record] = JSON.parse(packed.stdout);
      assert.equal(record.name, "grida");
      assert.equal(record.version, manifest.version);
      assert.equal(path.basename(record.filename), record.filename);
      CliRelease.files(record.files);
      const archive = await readFile(path.join(out, record.filename));
      const report = {
        name: manifest.name,
        version: manifest.version,
        private: manifest.private,
        archive: record.filename,
        archive_sha256: createHash("sha256").update(archive).digest("hex"),
        bytes: archive.length,
        files: record.files.map(({ path: filename, size }) => ({
          path: filename,
          size,
        })),
      };
      await writeFile(
        path.join(out, "candidate.json"),
        JSON.stringify(report, null, 2) + "\n",
        { mode: 0o600 }
      );
      return report;
    } catch (error) {
      if (created) await rm(out, { recursive: true, force: true });
      throw error;
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  },

  async verify(out, release) {
    assert(path.isAbsolute(out), "Candidate must be an absolute directory");
    const report = JSON.parse(
      await readFile(path.join(out, "candidate.json"), "utf8")
    );
    assert(
      /^grida-[0-9A-Za-z.-]+\.tgz$/.test(report.archive),
      "Unexpected archive name"
    );
    const archive = path.join(out, report.archive);
    const stat = await lstat(archive);
    assert(
      stat.isFile() && stat.size > 0 && stat.size <= 16 * 1024 * 1024,
      "Expected a bounded regular tarball"
    );
    assert.equal(stat.size, report.bytes, "Candidate size changed");
    assert.equal(
      createHash("sha256")
        .update(await readFile(archive))
        .digest("hex"),
      report.archive_sha256,
      "Candidate hash changed"
    );
    const options = { timeout: 10_000, maxBuffer: 1024 * 1024 };
    // Read without extraction or lifecycle scripts. The archive must match both
    // the reviewed manifest and the exact file boundary used during preparation.
    const listed = await execute("tar", ["-tzf", archive], options);
    const entries = listed.stdout.trim().split("\n");
    assert(entries.every((name) => name.startsWith("package/")));
    const filenames = entries.map((name) => name.slice("package/".length));
    CliRelease.files(filenames.map((path) => ({ path })));
    assert.deepEqual(
      filenames.sort(),
      report.files.map(({ path }) => path).sort()
    );
    const packed = await execute(
      "tar",
      ["-xOzf", archive, "package/package.json"],
      options
    );
    const manifest = JSON.parse(packed.stdout);
    assert.deepEqual(
      manifest,
      JSON.parse(
        await readFile(
          path.join(repository, "packages/grida-cli/package.json"),
          "utf8"
        )
      ),
      "Packed manifest differs from this revision"
    );
    CliRelease.manifest(manifest);
    assert.equal(report.name, manifest.name);
    assert.equal(report.version, manifest.version);
    assert.equal(report.private, manifest.private);
    if (release) CliRelease.release(manifest, release.version, release.tag);
    return report;
  },
};

async function main() {
  const { values } = parseArgs({
    options: {
      out: { type: "string" },
      "release-version": { type: "string" },
      tag: { type: "string" },
      "check-only": { type: "boolean" },
      verify: { type: "boolean" },
    },
  });
  assert(
    Number(process.versions.node.split(".")[0]) >= 24,
    "Node 24+ required"
  );
  const release =
    values["release-version"] === undefined
      ? undefined
      : { version: values["release-version"], tag: values.tag };
  assert(
    release || values.tag === undefined,
    "--tag requires --release-version"
  );
  if (values["check-only"]) {
    assert(
      release && values.out === undefined && !values.verify,
      "--check-only requires a release version and no output directory"
    );
    CliRelease.release(
      JSON.parse(
        await readFile(
          path.join(repository, "packages/grida-cli/package.json"),
          "utf8"
        )
      ),
      release.version,
      release.tag
    );
    console.info("CLI release manifest accepted.");
  } else {
    assert(values.out, "--out is required");
    console.info(
      JSON.stringify(
        await (values.verify ? CliRelease.verify : CliRelease.prepare)(
          values.out,
          release
        ),
        null,
        2
      )
    );
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(
      error instanceof assert.AssertionError
        ? error.message
        : "CLI package preparation failed."
    );
    process.exitCode = 1;
  });
