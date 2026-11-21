// GRIDA-SEC-004 — stage fixed command resources outside app.asar at build time.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import definition from "../src/fx-extension.json" with { type: "json" };
import { readExecutable } from "./native-agent-package.mjs";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));

function fxPackage(platform, arch) {
  if (platform === "win32") return undefined;
  const target = `${platform}-${arch}`;
  assert(
    Object.hasOwn(definition.platformPackages, target),
    "Unsupported bundled FX platform"
  );
  return definition.platformPackages[target];
}

function fxVersion() {
  const { devDependencies } = require(path.join(root, "package.json"));
  const version = devDependencies?.[definition.package];
  assert(
    /^\d+\.\d+\.\d+$/.test(version),
    "Desktop must pin an exact FX release"
  );
  return version;
}

export function resolveBundledProgramSource(platform, arch) {
  const name = fxPackage(platform, arch);
  if (!name) return;
  const version = fxVersion();
  const carrierPath = require.resolve(`${definition.package}/package.json`);
  const carrier = require(carrierPath);
  assert.equal(
    carrier.version,
    version,
    "Installed FX SDK differs from Desktop pin"
  );
  assert.equal(carrier.optionalDependencies?.[name], version);
  let platformPath;
  try {
    platformPath = createRequire(carrierPath).resolve(`${name}/package.json`);
  } catch (error) {
    if (error?.code !== "MODULE_NOT_FOUND") throw error;
    throw new Error(
      `Install ${name}@${version} in Desktop's build dependencies before packaging ${platform}-${arch}.`
    );
  }
  const manifest = require(platformPath);
  assert.equal(manifest.name, name);
  assert.equal(
    manifest.version,
    version,
    "Installed FX binary differs from Desktop pin"
  );
  return { source: path.dirname(platformPath), version };
}

/** Copy only the target package's reviewed native executable and license. */
export function stageBundledPrograms(resources, platform, arch) {
  const target = resolveBundledProgramSource(platform, arch);
  if (!target) return;
  const { source, version } = target;
  const bytes = readExecutable(
    path.join(source, "bin", definition.command),
    platform,
    arch
  );
  const destination = path.join(resources, definition.resourceDirectory);
  assert(
    !fs.existsSync(destination),
    "Bundled programs destination already exists"
  );
  const staging = fs.mkdtempSync(path.join(resources, ".bundled-programs-"));
  try {
    const bin = path.join(staging, "bin");
    fs.mkdirSync(bin, { mode: 0o755 });
    const executable = path.join(bin, definition.command);
    fs.writeFileSync(executable, bytes, {
      mode: 0o755,
      flag: "wx",
    });
    fs.chmodSync(executable, 0o755);
    fs.copyFileSync(
      path.join(source, "LICENSE"),
      path.join(staging, definition.licenseFile)
    );
    fs.writeFileSync(
      path.join(staging, definition.versionFile),
      version + "\n",
      {
        flag: "wx",
      }
    );
    fs.chmodSync(staging, 0o755);
    fs.renameSync(staging, destination);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

/** Check the staged payload on disk, and execute it on the matching target. */
export function verifyBundledPrograms(resources, platform, arch) {
  const carrier = path.join(resources, definition.resourceDirectory);
  if (!fxPackage(platform, arch)) {
    assert(!fs.existsSync(carrier), "Unexpected bundled programs for Windows");
    return false;
  }
  assert(fs.lstatSync(carrier).isDirectory());
  assert.deepEqual(
    fs.readdirSync(carrier).sort(),
    [definition.licenseFile, "bin", definition.versionFile].sort()
  );
  const bin = path.join(carrier, "bin");
  assert(fs.lstatSync(bin).isDirectory());
  assert.deepEqual(fs.readdirSync(bin), [definition.command]);
  const file = path.join(bin, definition.command);
  readExecutable(file, platform, arch, true);
  const version = fxVersion();
  assert.equal(
    fs.readFileSync(path.join(carrier, definition.versionFile), "utf8"),
    version + "\n"
  );
  if (process.platform === platform && process.arch === arch) {
    const reported = execFileSync(file, ["--version"], {
      encoding: "utf8",
      timeout: 5000,
      maxBuffer: 4096,
      env: {},
    });
    assert.equal(reported.trim(), `${definition.command} ${version}`);
  }
  return true;
}

if (import.meta.main) {
  const [resources, platform, arch] = process.argv.slice(2);
  stageBundledPrograms(resources, platform, arch);
}
