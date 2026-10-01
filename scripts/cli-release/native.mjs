import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));
const source = path.join(root, "packages/grida-cli");
export const platforms = JSON.parse(
  await readFile(path.join(source, "native/platforms.json"), "utf8")
);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => JSON.stringify(value, null, 2) + "\n";
const binaryName = (platform) =>
  platform.os === "win32" ? "grida.exe" : "grida";

export function launcherManifest(sourceManifest) {
  assert.equal(sourceManifest.name, "grida");
  assert(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(
      sourceManifest.version
    )
  );
  const {
    name,
    version,
    description,
    homepage,
    license,
    repository,
    private: privatePackage,
  } = sourceManifest;
  return {
    name,
    version,
    private: privatePackage,
    description,
    homepage,
    license,
    repository,
    type: "module",
    bin: { grida: "./native/bin.mjs" },
    files: [
      "native/bin.mjs",
      "native/platforms.json",
      "native/licenses.json",
      "THIRD-PARTY-NOTICES.txt",
    ],
    optionalDependencies: Object.fromEntries(
      platforms.map((p) => [`@grida/cli-${p.id}`, version])
    ),
    engines: { node: ">=24.0.0" },
    grida_native: 1,
  };
}

export function platformManifest(platform, version) {
  return {
    name: `@grida/cli-${platform.id}`,
    version,
    description: `Grida native executable for ${platform.id}.`,
    license: "Apache-2.0",
    repository: "https://github.com/gridaco/grida",
    os: [platform.os],
    cpu: [platform.cpu],
    ...(platform.libc ? { libc: [platform.libc] } : {}),
    files: [`bin/${binaryName(platform)}`, "THIRD-PARTY-NOTICES.txt"],
    publishConfig: { access: "public" },
  };
}

/** Catch mislabelled target artifacts without executing an untrusted architecture. */
export function binaryHeader(bytes, platform) {
  assert(bytes.length >= 64, "Native executable is too short");
  if (platform.os === "darwin") {
    assert.equal(
      bytes.readUInt32LE(0),
      0xfeedfacf,
      "Expected a 64-bit Mach-O executable"
    );
    assert.equal(
      bytes.readUInt32LE(4),
      platform.cpu === "arm64" ? 0x0100000c : 0x01000007,
      "Mach-O architecture does not match target"
    );
    assert.equal(
      bytes.readUInt32LE(12),
      2,
      "Expected an executable Mach-O image"
    );
  } else if (platform.os === "linux") {
    assert.equal(
      bytes.subarray(0, 4).toString("hex"),
      "7f454c46",
      "Expected an ELF executable"
    );
    assert.equal(bytes[4], 2, "Expected 64-bit ELF");
    assert.equal(bytes[5], 1, "Expected little-endian ELF");
    assert(
      [2, 3].includes(bytes.readUInt16LE(16)),
      "Expected executable/PIE ELF"
    );
    assert.equal(
      bytes.readUInt16LE(18),
      platform.cpu === "arm64" ? 183 : 62,
      "ELF architecture does not match target"
    );
  } else {
    assert.equal(
      bytes.subarray(0, 2).toString(),
      "MZ",
      "Expected a Windows PE executable"
    );
    const offset = bytes.readUInt32LE(0x3c);
    assert(
      offset >= 64 && offset + 26 <= bytes.length,
      "Invalid PE header offset"
    );
    assert.equal(
      bytes.readUInt32LE(offset),
      0x00004550,
      "Expected PE signature"
    );
    assert.equal(
      bytes.readUInt16LE(offset + 4),
      platform.cpu === "arm64" ? 0xaa64 : 0x8664,
      "PE architecture does not match target"
    );
    assert.equal(
      bytes.readUInt16LE(offset + 24),
      0x20b,
      "Expected a 64-bit PE image"
    );
  }
}

export async function npmProgram() {
  const directory = path.dirname(process.execPath);
  const candidates =
    process.platform === "win32"
      ? [path.join(directory, "node_modules/npm/bin/npm-cli.js")]
      : [
          path.join(directory, "npm"),
          path.join(directory, "../lib/node_modules/npm/bin/npm-cli.js"),
        ];
  for (const candidate of candidates) {
    try {
      const resolved = await realpath(candidate);
      if (path.basename(resolved) === "npm-cli.js") return resolved;
    } catch {}
  }
  throw new Error("Cannot locate this Node installation's companion npm CLI.");
}

export async function npmRun(args, scratch, options = {}) {
  await writeFile(path.join(scratch, "user.npmrc"), "");
  await writeFile(path.join(scratch, "global.npmrc"), "");
  return exec(process.execPath, [await npmProgram(), ...args], {
    cwd: scratch,
    timeout: 60_000,
    maxBuffer: 4 * 1024 * 1024,
    env: {
      PATH: [path.dirname(process.execPath), "/usr/bin", "/bin"].join(
        path.delimiter
      ),
      ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
      // npm resolves the OS home before reading the explicit config paths.
      // Container users may have only a numeric UID, with no passwd entry.
      HOME: scratch,
      USERPROFILE: scratch,
      TMPDIR: scratch,
      TEMP: scratch,
      TMP: scratch,
      npm_config_cache: path.join(scratch, "cache"),
      npm_config_userconfig: path.join(scratch, "user.npmrc"),
      npm_config_globalconfig: path.join(scratch, "global.npmrc"),
      npm_config_update_notifier: "false",
    },
    ...options,
  });
}

function allowedFiles(record, manifest, platform) {
  const expected = platform
    ? [
        "package.json",
        "LICENSE",
        "README.md",
        `bin/${binaryName(platform)}`,
        "THIRD-PARTY-NOTICES.txt",
      ]
    : [
        "package.json",
        "LICENSE",
        "README.md",
        "native/bin.mjs",
        "native/platforms.json",
        "native/licenses.json",
        "THIRD-PARTY-NOTICES.txt",
      ];
  const names = record.files.map((item) => item.path);
  assert.deepEqual(
    names.slice().sort(),
    expected.sort(),
    `Unexpected packed boundary for ${manifest.name}`
  );
  assert.equal(new Set(names).size, names.length);
}

async function pack(directory, archives, scratch, manifest, platform) {
  const { stdout } = await npmRun(
    [
      "pack",
      directory,
      "--pack-destination",
      archives,
      "--json",
      "--offline",
      "--ignore-scripts",
    ],
    scratch
  );
  const [record] = JSON.parse(stdout);
  assert.equal(record.name, manifest.name);
  assert.equal(record.version, manifest.version);
  assert.equal(path.basename(record.filename), record.filename);
  allowedFiles(record, manifest, platform);
  const bytes = await readFile(path.join(archives, record.filename));
  return {
    name: record.name,
    version: record.version,
    archive: record.filename,
    sha256: sha256(bytes),
    bytes: bytes.length,
    unpacked_bytes: record.unpackedSize,
    files: record.files.map(({ path: filename, size, mode }) => ({
      path: filename,
      size,
      mode,
    })),
    ...(platform ? { target: platform.target, platform: platform.id } : {}),
  };
}

export async function prepareNative({ artifacts, out }) {
  assert(
    path.isAbsolute(artifacts) && path.isAbsolute(out),
    "Use absolute artifact/output directories"
  );
  const manifest = launcherManifest(
    JSON.parse(await readFile(path.join(source, "package.json"), "utf8"))
  );
  const licenses = JSON.parse(
    await readFile(path.join(source, "native/licenses.json"), "utf8")
  );
  assert.equal(
    licenses.cargo_lock_sha256,
    sha256(await readFile(path.join(root, "Cargo.lock"))),
    "Refresh native license notices after lockfile changes"
  );
  const scratch = await mkdtemp(path.join(tmpdir(), "grida-native-pack-"));
  let created = false;
  try {
    await mkdir(out, { mode: 0o700 });
    created = true;
    const packages = path.join(out, "packages");
    const archives = path.join(out, "archives");
    await mkdir(packages);
    await mkdir(archives);
    const main = path.join(packages, "grida");
    await mkdir(path.join(main, "native"), { recursive: true });
    await writeFile(path.join(main, "package.json"), json(manifest));
    for (const file of ["bin.mjs", "platforms.json", "licenses.json"])
      await copyFile(
        path.join(source, "native", file),
        path.join(main, "native", file)
      );
    await chmod(path.join(main, "native/bin.mjs"), 0o755);
    await copyFile(
      path.join(source, "README.md"),
      path.join(main, "README.md")
    );
    await copyFile(
      path.join(source, "THIRD-PARTY-NOTICES.txt"),
      path.join(main, "THIRD-PARTY-NOTICES.txt")
    );
    await copyFile(path.join(root, "LICENSE"), path.join(main, "LICENSE"));
    const records = [];
    const comparison = path.join(scratch, "comparison");
    await mkdir(comparison);
    await writeFile(
      path.join(comparison, "package.json"),
      json({
        name: "grida-native-size-comparison",
        version: manifest.version,
        private: true,
        files: ["bin", "THIRD-PARTY-NOTICES.txt"],
      })
    );
    await copyFile(
      path.join(source, "THIRD-PARTY-NOTICES.txt"),
      path.join(comparison, "THIRD-PARTY-NOTICES.txt")
    );
    for (const platform of platforms) {
      const binary = path.join(
        artifacts,
        platform.target,
        binaryName(platform)
      );
      const stat = await lstat(binary);
      assert(
        stat.isFile() && stat.size <= 256 * 1024 * 1024,
        "Expected a bounded regular executable"
      );
      const bytes = await readFile(binary);
      binaryHeader(bytes, platform);
      const directory = path.join(packages, `grida-cli-${platform.id}`);
      await mkdir(path.join(directory, "bin"), { recursive: true });
      const pm = platformManifest(platform, manifest.version);
      await writeFile(path.join(directory, "package.json"), json(pm));
      await copyFile(binary, path.join(directory, "bin", binaryName(platform)));
      await chmod(path.join(directory, "bin", binaryName(platform)), 0o755);
      await copyFile(
        path.join(root, "LICENSE"),
        path.join(directory, "LICENSE")
      );
      await copyFile(
        path.join(source, "THIRD-PARTY-NOTICES.txt"),
        path.join(directory, "THIRD-PARTY-NOTICES.txt")
      );
      await writeFile(
        path.join(directory, "README.md"),
        `# ${pm.name}\n\nPlatform executable for grida@${manifest.version}. Install grida, which selects this package automatically.\n`
      );
      const record = await pack(directory, archives, scratch, pm, platform);
      records.push({
        ...record,
        binary_sha256: sha256(bytes),
        binary_bytes: bytes.length,
      });
      await mkdir(path.join(comparison, "bin", platform.id), {
        recursive: true,
      });
      await copyFile(
        binary,
        path.join(comparison, "bin", platform.id, binaryName(platform))
      );
    }
    const launcher = await pack(main, archives, scratch, manifest);
    const combined = JSON.parse(
      (
        await npmRun(
          [
            "pack",
            comparison,
            "--pack-destination",
            scratch,
            "--json",
            "--offline",
            "--ignore-scripts",
          ],
          scratch
        )
      ).stdout
    )[0];
    const report = {
      format: 1,
      name: manifest.name,
      version: manifest.version,
      launcher,
      platforms: records,
      size_comparison: {
        all_binary_tgz_bytes: combined.size,
        all_binary_unpacked_bytes: combined.unpackedSize,
        selected_install_tgz_bytes: Object.fromEntries(
          records.map((record) => [
            record.platform,
            record.bytes + launcher.bytes,
          ])
        ),
      },
    };
    await writeFile(path.join(out, "native-candidate.json"), json(report), {
      mode: 0o600,
    });
    return report;
  } catch (error) {
    if (created) await rm(out, { recursive: true, force: true });
    throw error;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

export async function verifyNative(out) {
  assert(path.isAbsolute(out));
  const inventory = JSON.parse(
    await readFile(path.join(source, "native/licenses.json"), "utf8")
  );
  assert.equal(
    inventory.cargo_lock_sha256,
    sha256(await readFile(path.join(root, "Cargo.lock"))),
    "Refresh native license notices after changing Cargo.lock"
  );
  const report = JSON.parse(
    await readFile(path.join(out, "native-candidate.json"), "utf8")
  );
  assert.equal(report.format, 1);
  const manifest = launcherManifest(
    JSON.parse(await readFile(path.join(source, "package.json"), "utf8"))
  );
  assert.equal(report.version, manifest.version);
  assert.equal(report.name, manifest.name);
  assert.deepEqual(
    report.platforms.map((p) => p.platform),
    platforms.map((p) => p.id)
  );
  for (const record of [...report.platforms, report.launcher]) {
    assert(/^[A-Za-z0-9._-]+\.tgz$/.test(record.archive));
    const archive = path.join(out, "archives", record.archive);
    const stat = await lstat(archive);
    assert(stat.isFile() && stat.size > 0 && stat.size <= 256 * 1024 * 1024);
    const bytes = await readFile(archive);
    assert.equal(bytes.length, record.bytes);
    assert.equal(sha256(bytes), record.sha256);
    // GNU tar interprets a Windows drive colon in -f as a remote host.
    // The validated basename stays local with both GNU and BSD tar.
    const options = {
      cwd: path.dirname(archive),
      timeout: 20_000,
      maxBuffer: 1024 * 1024,
    };
    const listing = (
      await exec("tar", ["-tzf", record.archive], options)
    ).stdout
      .trim()
      .split("\n");
    assert(listing.every((name) => name.startsWith("package/")));
    assert.deepEqual(
      listing.map((name) => name.slice(8)).sort(),
      record.files.map((file) => file.path).sort()
    );
    const packedManifest = JSON.parse(
      (
        await exec(
          "tar",
          ["-xOzf", record.archive, "package/package.json"],
          options
        )
      ).stdout
    );
    const platform = platforms.find((p) => p.id === record.platform);
    const expected = platform
      ? platformManifest(platform, manifest.version)
      : manifest;
    assert.deepEqual(packedManifest, expected);
    allowedFiles(record, expected, platform);
    assert.equal(record.name, expected.name);
    assert.equal(record.version, expected.version);
    assert.equal(
      (
        await exec(
          "tar",
          ["-xOzf", record.archive, "package/THIRD-PARTY-NOTICES.txt"],
          options
        )
      ).stdout,
      await readFile(path.join(source, "THIRD-PARTY-NOTICES.txt"), "utf8")
    );
    if (platform) {
      assert.equal(record.target, platform.target);
      const binary = (
        await exec(
          "tar",
          ["-xOzf", record.archive, `package/bin/${binaryName(platform)}`],
          { ...options, encoding: "buffer", maxBuffer: 256 * 1024 * 1024 }
        )
      ).stdout;
      binaryHeader(binary, platform);
      assert.equal(binary.length, record.binary_bytes);
      assert.equal(sha256(binary), record.binary_sha256);
    } else {
      for (const file of [
        "README.md",
        "native/bin.mjs",
        "native/platforms.json",
        "native/licenses.json",
      ]) {
        const packed = (
          await exec(
            "tar",
            ["-xOzf", record.archive, `package/${file}`],
            options
          )
        ).stdout;
        assert.equal(packed, await readFile(path.join(source, file), "utf8"));
      }
    }
  }
  return report;
}

async function main() {
  const { values } = parseArgs({
    options: {
      artifacts: { type: "string" },
      out: { type: "string" },
      verify: { type: "boolean" },
      matrix: { type: "boolean" },
    },
  });
  if (values.matrix) {
    assert(!values.out && !values.artifacts && !values.verify);
    process.stdout.write(json({ include: platforms }));
    return;
  }
  assert(values.out, "--out is required");
  const report = values.verify
    ? await verifyNative(values.out)
    : await prepareNative({ artifacts: values.artifacts, out: values.out });
  process.stdout.write(json(report));
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof assert.AssertionError ? error.message : "Native candidate preparation failed."}\n`
    );
    process.exitCode = 1;
  });
