import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import http from "node:http";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";
import {
  binaryHeader,
  launcherManifest,
  npmRun,
  platforms,
  prepareNative,
  verifyNative,
} from "./native.mjs";
import { proveNative } from "./native-proof.mjs";
import { fixtureBinary } from "./native-fixture.mjs";
import { verifyGlibcBaseline, verifyMuslStatic } from "./native-abi.mjs";
import {
  publishVerifiedArchives,
  releaseGuard,
  verifyInstalledMatrix,
} from "./native-publish.mjs";
import { selectPlatform } from "../../packages/grida-cli/native/bin.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const exec = promisify(execFile);

test("installed proof reports a safe failure stage without private paths", async (t) => {
  const scratch = await mkdtemp(
    path.join(tmpdir(), "grida-native-private-path-")
  );
  t.after(() => rm(scratch, { recursive: true, force: true }));
  await assert.rejects(
    exec(process.execPath, [
      path.join(root, "scripts/cli-release/native-proof.mjs"),
      "--out",
      scratch,
    ]),
    (error) => {
      assert.equal(error.code, 1);
      assert.equal(error.stdout, "");
      assert.equal(
        error.stderr,
        "Installed native candidate proof failed at candidate_verification (ENOENT).\n"
      );
      assert(!error.stderr.includes(scratch));
      return true;
    }
  );
});

test("npm runs with a disposable home even before loading its explicit config", async (t) => {
  const scratch = await mkdtemp(path.join(tmpdir(), "grida-native-npm-home-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  await writeFile(
    path.join(scratch, "package.json"),
    JSON.stringify({ scripts: { proof: "node home.cjs" } })
  );
  await writeFile(
    path.join(scratch, "home.cjs"),
    "if (require('node:fs').realpathSync(require('node:os').homedir()) !== process.cwd()) process.exit(19); process.stdout.write('isolated home\\n');\n"
  );
  const { stdout } = await npmRun(
    ["run", "--silent", "--ignore-scripts", "proof"],
    scratch
  );
  assert.equal(stdout, "isolated home\n");
});

test("Windows checkout filters preserve byte-verified native release sources", async (t) => {
  const scratch = await mkdtemp(path.join(tmpdir(), "grida-native-checkout-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  await exec("git", ["init", "--quiet", scratch]);
  try {
    await copyFile(
      path.join(root, ".gitattributes"),
      path.join(scratch, ".gitattributes")
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const git = (...args) =>
    exec("git", ["-c", "core.autocrlf=true", "-c", "core.eol=crlf", ...args], {
      cwd: scratch,
      maxBuffer: 16 * 1024 * 1024,
    });
  for (const filename of [
    "Cargo.lock",
    "LICENSE",
    "packages/grida-cli/README.md",
    "packages/grida-cli/THIRD-PARTY-NOTICES.txt",
    "packages/grida-cli/native/bin.mjs",
    "packages/grida-cli/native/platforms.json",
    "packages/grida-cli/native/licenses.json",
  ]) {
    const bytes = await readFile(path.join(root, filename));
    const input = path.join(scratch, "source");
    await writeFile(input, bytes);
    const { stdout: object } = await git(
      "hash-object",
      "--no-filters",
      "-w",
      input
    );
    const { stdout } = await git(
      "cat-file",
      "--filters",
      `--path=${filename}`,
      object.trim()
    );
    assert.equal(
      createHash("sha256").update(stdout).digest("hex"),
      createHash("sha256").update(bytes).digest("hex"),
      filename
    );
  }
});

async function rootOnlyInstall(out, report, runtime) {
  const metadata = new Map();
  const archives = new Map();
  for (const record of [report.launcher, ...report.platforms]) {
    const filename = path.join(out, "archives", record.archive);
    const bytes = await readFile(filename);
    const manifest = JSON.parse(
      (
        await exec("tar", ["-xOzf", record.archive, "package/package.json"], {
          cwd: path.dirname(filename),
          timeout: 10_000,
          maxBuffer: 1024 * 1024,
        })
      ).stdout
    );
    metadata.set(record.name, {
      manifest,
      archive: record.archive,
      integrity:
        "sha512-" + createHash("sha512").update(bytes).digest("base64"),
    });
    archives.set(`/-/${record.archive}`, bytes);
  }
  const requestedArchives = [];
  const unexpected = [];
  let origin;
  const registry = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, origin).pathname);
    const archive = archives.get(pathname);
    if (request.method === "GET" && archive) {
      requestedArchives.push(pathname.slice(3));
      response.writeHead(200, { "content-type": "application/octet-stream" });
      response.end(archive);
      return;
    }
    const entry = metadata.get(pathname.slice(1));
    if (request.method === "GET" && entry) {
      const { manifest, archive, integrity } = entry;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          name: manifest.name,
          "dist-tags": { latest: manifest.version },
          versions: {
            [manifest.version]: {
              ...manifest,
              dist: { tarball: `${origin}/-/${archive}`, integrity },
            },
          },
        })
      );
      return;
    }
    unexpected.push(`${request.method} ${pathname}`);
    response.writeHead(404, { "content-type": "application/json" });
    response.end('{"error":"Unknown fixture package"}');
  });
  await new Promise((resolve, reject) => {
    registry.once("error", reject);
    registry.listen(0, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${registry.address().port}`;
  try {
    await mkdir(runtime);
    // Install only the public package. In particular, do not name a native
    // tarball here: npm must resolve and filter all eight optional packages.
    // npmRun supplies an empty per-test cache/configuration, with audit off.
    await npmRun(
      [
        "install",
        `grida@${report.version}`,
        "--registry",
        origin,
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--package-lock=false",
        "--omit=dev",
        "--fetch-retries=0",
      ],
      runtime
    );
    assert.deepEqual(unexpected, []);
    const host = selectPlatform();
    const selected = report.platforms.find((p) => p.platform === host.id);
    assert.deepEqual(
      (await readdir(path.join(runtime, "node_modules/@grida"))).sort(),
      [`cli-${host.id}`]
    );
    assert.deepEqual(
      requestedArchives.sort(),
      [report.launcher.archive, selected.archive].sort()
    );
    const executable = path.join(
      runtime,
      "node_modules",
      selected.name,
      "bin",
      host.os === "win32" ? "grida.exe" : "grida"
    );
    assert.equal(
      createHash("sha256")
        .update(await readFile(executable))
        .digest("hex"),
      selected.binary_sha256
    );
    const version = await exec(
      process.execPath,
      [path.join(runtime, "node_modules/grida/native/bin.mjs"), "--version"],
      { cwd: runtime, timeout: 10_000, maxBuffer: 1024 * 1024 }
    );
    assert.equal(version.stdout, `grida ${report.version}\n`);
    assert.equal(version.stderr, "");
  } finally {
    registry.closeAllConnections();
    await new Promise((resolve) => registry.close(resolve));
  }
}

async function publicationFixture(t) {
  const out = await mkdtemp(
    path.join(tmpdir(), "grida-native-publication-test-")
  );
  t.after(() => rm(out, { recursive: true, force: true }));
  await mkdir(path.join(out, "archives"));
  const records = [...platforms.map((p) => `@grida/cli-${p.id}`), "grida"].map(
    (name, i) => ({ name, version: "0.3.0-rc.1", archive: `${i}.tgz` })
  );
  const registry = new Map();
  const calls = [];
  const integrity = (record) =>
    "sha512-" + createHash("sha512").update(record.name).digest("base64");
  for (const record of records)
    await writeFile(path.join(out, "archives", record.archive), record.name);
  async function invoke(args) {
    calls.push(args);
    if (args[0] === "publish") return { stdout: "" };
    assert.equal(args[0], "view");
    const entry = registry.get(args[1]);
    if (!entry)
      throw Object.assign(new Error("Registry version is absent"), {
        stdout: JSON.stringify({ error: { code: "E404" } }),
      });
    return { stdout: JSON.stringify(entry[args[2]]) };
  }
  function published(record, overrides = {}) {
    registry.set(`${record.name}@${record.version}`, {
      "dist.integrity": integrity(record),
      ...overrides,
    });
    registry.set(record.name, { "dist-tags.next": record.version });
  }
  return {
    records,
    out,
    tag: "next",
    invoke,
    log: () => {},
    registry,
    calls,
    published,
  };
}

test("a launcher version collision fails before any platform publication", async (t) => {
  const fixture = await publicationFixture(t);
  fixture.published(fixture.records.at(-1), {
    "dist.integrity": "sha512-different",
  });
  await assert.rejects(
    publishVerifiedArchives(fixture.records, fixture),
    /Existing immutable grida/
  );
  assert.equal(
    fixture.calls.filter(([operation]) => operation === "publish").length,
    0
  );
});

test("a changed resume tag fails before any new package publication", async (t) => {
  const fixture = await publicationFixture(t);
  const last = fixture.records.at(-1);
  fixture.published(last);
  fixture.registry.set(last.name, { "dist-tags.next": "0.2.0" });
  await assert.rejects(
    publishVerifiedArchives(fixture.records, fixture),
    /different next tag/
  );
  assert.equal(
    fixture.calls.filter(([operation]) => operation === "publish").length,
    0
  );
});

test("publication preflights the whole set, then publishes platforms before the launcher", async (t) => {
  const fixture = await publicationFixture(t);
  await publishVerifiedArchives(fixture.records, fixture);
  assert(
    fixture.calls
      .slice(0, fixture.records.length)
      .every(([operation]) => operation === "view")
  );
  const publishes = fixture.calls.filter(
    ([operation]) => operation === "publish"
  );
  assert.deepEqual(
    publishes.map((args) => path.basename(args[1])),
    fixture.records.map((record) => record.archive)
  );
  for (const args of publishes)
    assert.deepEqual(args.slice(2), [
      "--access",
      "public",
      "--provenance",
      "--tag",
      "next",
      "--ignore-scripts",
      "--registry",
      "https://registry.npmjs.org",
    ]);
});

test("an identical partial release resumes without republishing existing bytes", async (t) => {
  const fixture = await publicationFixture(t);
  for (const record of fixture.records.slice(0, 3)) fixture.published(record);
  await publishVerifiedArchives(fixture.records, fixture);
  assert.deepEqual(
    fixture.calls
      .filter(([operation]) => operation === "publish")
      .map((args) => path.basename(args[1])),
    fixture.records.slice(3).map((record) => record.archive)
  );
});

test("registry read failures and malformed metadata never become permission to publish", async (t) => {
  for (const failure of [
    Object.assign(new Error("network"), {
      stdout: JSON.stringify({ error: { code: "E503" } }),
      stderr: "Registry proxy mentioned E404 while failing",
    }),
    { stdout: "{}" },
    { stdout: "null" },
    { stdout: '""' },
  ]) {
    const fixture = await publicationFixture(t);
    const invoke = async (args) => {
      if (args[1] === `grida@${fixture.records.at(-1).version}`) {
        if (failure instanceof Error) throw failure;
        return failure;
      }
      return fixture.invoke(args);
    };
    await assert.rejects(
      publishVerifiedArchives(fixture.records, { ...fixture, invoke })
    );
    assert.equal(
      fixture.calls.filter(([operation]) => operation === "publish").length,
      0
    );
  }
});

test("publication rechecks a package after preflight instead of overwriting a race", async (t) => {
  const fixture = await publicationFixture(t);
  let views = 0;
  const invoke = async (args) => {
    if (args[0] === "view" && ++views > fixture.records.length) {
      fixture.published(fixture.records[0], {
        "dist.integrity": "sha512-concurrent",
      });
    }
    return fixture.invoke(args);
  };
  await assert.rejects(
    publishVerifiedArchives(fixture.records, { ...fixture, invoke }),
    /Existing immutable/
  );
  assert.equal(
    fixture.calls.filter(([operation]) => operation === "publish").length,
    0
  );
});

test("musl artifacts reject interpreters and shared dependencies while allowing static PIE", () => {
  const headers = "Program Headers:\n  Type Offset VirtAddr\n  LOAD 0x0 0x0\n";
  const pie =
    "Dynamic section at offset 0x100 contains 2 entries:\n  (FLAGS_1) Flags: PIE\n  (NULL) 0x0\n";
  const fixed = "There is no dynamic section in this file.\n";
  assert.deepEqual(verifyMuslStatic(headers, pie), {
    linkage: "static",
    needed: [],
  });
  assert.deepEqual(verifyMuslStatic(headers, fixed), {
    linkage: "static",
    needed: [],
  });
  // musl-gcc's static-PIE wrapper regression links successfully but adds this
  // loader and crashes before main. ABI inspection must reject it before packing.
  assert.throws(
    () => verifyMuslStatic(`${headers}  INTERP 0x270 0x270\n`, pie),
    /dynamic interpreter/
  );
  assert.throws(
    () =>
      verifyMuslStatic(headers, `${pie}  (NEEDED) Shared library: [libc.so]\n`),
    /shared libraries/
  );
  assert.throws(() => verifyMuslStatic("", pie), /program headers/);
  assert.throws(
    () => verifyMuslStatic(headers, ""),
    /dynamic-section inspection/
  );
});

test("GNU packages reject newer glibc symbols and unbundled libraries", () => {
  const dynamic =
    "0x1 (NEEDED) Shared library: [libc.so.6]\n0x1 (NEEDED) Shared library: [libgcc_s.so.1]";
  assert.equal(
    verifyGlibcBaseline("GLIBC_2.17 GLIBC_2.28", dynamic).glibc_maximum,
    "2.28"
  );
  assert.throws(
    () => verifyGlibcBaseline("GLIBC_2.29", dynamic),
    /maximum is 2.28/
  );
  assert.throws(
    () => verifyGlibcBaseline("GLIBC_PRIVATE", dynamic),
    /Unsupported/
  );
  assert.throws(
    () =>
      verifyGlibcBaseline("GLIBC_2.17", dynamic + "\n(NEEDED) [libssl.so.3]"),
    /Unbundled/
  );
});

test("release requires the native manifest, stable tag policy and real installed proofs", async (t) => {
  const manifest = launcherManifest({
    name: "grida",
    version: "0.2.0",
    private: false,
  });
  releaseGuard(manifest, "0.2.0", "latest");
  releaseGuard({ ...manifest, version: "0.3.0-rc.1" }, "0.3.0-rc.1", "next");
  assert.throws(() =>
    releaseGuard({ ...manifest, grida_native: undefined }, "0.2.0", "latest")
  );
  assert.throws(() => releaseGuard(manifest, "0.2.1", "latest"));
  assert.throws(() =>
    releaseGuard({ ...manifest, version: "0.2.0-01" }, "0.2.0-01", "next")
  );
  assert.throws(() =>
    releaseGuard({ ...manifest, version: "0.2.0-rc.1" }, "0.2.0-rc.1", "latest")
  );
  const out = await mkdtemp(path.join(tmpdir(), "grida-native-release-test-"));
  t.after(() => rm(out, { recursive: true, force: true }));
  const report = {
    version: "0.2.0",
    launcher: { sha256: "launcher" },
    platforms: platforms.map((p) => ({
      platform: p.id,
      sha256: p.id,
      binary_sha256: `${p.id}-binary`,
    })),
  };
  const checks = [
    "offline_npm_install",
    "exact_optional_version",
    "installed_binary_hash",
    "version",
    "help",
    "docs",
    "usage_exit_2",
    "npm_bin_shim",
  ];
  for (const p of report.platforms)
    await writeFile(
      path.join(out, `installed-${p.platform}.json`),
      JSON.stringify({
        version: report.version,
        platform: p.platform,
        archive_sha256: "launcher",
        native_archive_sha256: p.sha256,
        binary_sha256: p.binary_sha256,
        checks,
      })
    );
  await verifyInstalledMatrix(out, report);
  await assert.rejects(
    verifyInstalledMatrix(out, { ...report, fixture_targets: ["win32-arm64"] }),
    /cannot be released/
  );
  await writeFile(
    path.join(out, `installed-${report.platforms[0].platform}.json`),
    JSON.stringify({ version: "0.1.0" })
  );
  await assert.rejects(verifyInstalledMatrix(out, report));
});

test("platform metadata is exact, libc-specific and never guesses another architecture", () => {
  assert.equal(platforms.length, 8);
  assert.equal(new Set(platforms.map((p) => p.target)).size, 8);
  const manifest = launcherManifest({ name: "grida", version: "0.2.0" });
  assert(
    Object.values(manifest.optionalDependencies).every((v) => v === "0.2.0")
  );
  assert.equal(
    selectPlatform("linux", "x64", { header: { glibcVersionRuntime: "2.35" } })
      .id,
    "linux-x64-gnu"
  );
  assert.equal(
    selectPlatform("linux", "arm64", { header: {} }).id,
    "linux-arm64-musl"
  );
  assert.equal(selectPlatform("win32", "arm64").id, "win32-arm64");
  assert.equal(selectPlatform("linux", "riscv64", { header: {} }), undefined);
  for (const p of platforms) {
    binaryHeader(fixtureBinary(p), p);
    assert.throws(() =>
      binaryHeader(fixtureBinary(p), {
        ...p,
        cpu: p.cpu === "arm64" ? "x64" : "arm64",
      })
    );
  }
});

test(
  "actual host binary packs, verifies and installs through npm, including root-only optional dependency resolution",
  { timeout: 120_000 },
  async (t) => {
    const scratch = await mkdtemp(
      path.join(tmpdir(), "grida-native-proof-test-")
    );
    t.after(() => rm(scratch, { recursive: true, force: true }));
    const artifacts = path.join(scratch, "artifacts");
    await mkdir(artifacts);
    const host = selectPlatform();
    assert(host);
    const binary =
      process.env.GRIDA_NATIVE_TEST_BINARY ??
      path.join(
        root,
        "target/debug",
        process.platform === "win32" ? "grida.exe" : "grida"
      );
    for (const p of platforms) {
      const directory = path.join(artifacts, p.target);
      await mkdir(directory);
      const name = path.join(
        directory,
        p.os === "win32" ? "grida.exe" : "grida"
      );
      if (p.id === host.id) await copyFile(binary, name);
      else await writeFile(name, fixtureBinary(p));
    }
    const out = path.join(scratch, "candidate");
    const report = await prepareNative({ artifacts, out });
    assert.equal((await verifyNative(out)).version, report.version);
    const proof = await proveNative(out);
    assert.equal(proof.platform, host.id);
    assert(proof.checks.includes("installed_binary_hash"));
    await rootOnlyInstall(out, report, path.join(scratch, "root-only-install"));
    // These bytes are useful only for fixture regression; release measurements
    // must come from eight real matrix artifacts, not multiplied host estimates.
    assert(report.size_comparison.all_binary_tgz_bytes > 0);
    const archive = path.join(out, "archives", report.launcher.archive);
    await writeFile(
      archive,
      Buffer.concat([await readFile(archive), Buffer.from("tamper")])
    );
    await assert.rejects(verifyNative(out));
  }
);

async function launcherFixture(scratch) {
  const platform = selectPlatform();
  const version = "0.2.0";
  const directory = path.join(scratch, "grida");
  await mkdir(path.join(directory, "native"), { recursive: true });
  await writeFile(
    path.join(directory, "package.json"),
    JSON.stringify({ name: "grida", version, type: "module" })
  );
  for (const file of ["bin.mjs", "platforms.json"])
    await copyFile(
      path.join(root, "packages/grida-cli/native", file),
      path.join(directory, "native", file)
    );
  const installed = path.join(
    directory,
    "node_modules/@grida",
    `cli-${platform.id}`
  );
  await mkdir(path.join(installed, "bin"), { recursive: true });
  await writeFile(
    path.join(installed, "package.json"),
    JSON.stringify({ name: `@grida/cli-${platform.id}`, version })
  );
  // A real native executable (Node) exposes argv/stdin/signal behavior without
  // invoking credentials, providers, or network from the Grida application.
  const executable = path.join(
    installed,
    "bin",
    process.platform === "win32" ? "grida.exe" : "grida"
  );
  if (process.platform === "win32")
    await copyFile(process.execPath, executable);
  else await symlink(process.execPath, executable);
  return { launcher: path.join(directory, "native/bin.mjs"), installed };
}

function childResult(child) {
  let stdout = "",
    stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) =>
      resolve({ code, signal, stdout, stderr })
    );
  });
}

test("launcher preserves arguments, stdin, stdout, stderr and exit status", async (t) => {
  const scratch = await mkdtemp(path.join(tmpdir(), "grida-launcher-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const { launcher, installed } = await launcherFixture(scratch);
  const args = ["a b", "--no-input", "雪", "%PATH%"];
  const script =
    "process.stdout.write(JSON.stringify({args:process.argv.slice(1),stdin:require('node:fs').readFileSync(0,'utf8')}));process.stderr.write('diagnostic');process.exitCode=7";
  const child = spawn(
    process.execPath,
    [launcher, "-e", script, "--", ...args],
    { stdio: "pipe" }
  );
  const result = childResult(child);
  child.stdin.end("stdin bytes\n");
  const value = await result;
  assert.equal(value.code, 7, JSON.stringify(value));
  assert.equal(value.stderr, "diagnostic");
  assert.deepEqual(JSON.parse(value.stdout), { args, stdin: "stdin bytes\n" });
  await writeFile(
    path.join(installed, "package.json"),
    JSON.stringify({
      name: `@grida/cli-${selectPlatform().id}`,
      version: "0.1.0",
    })
  );
  const wrong = spawn(process.execPath, [launcher, "--version"], {
    stdio: "pipe",
  });
  wrong.stdin.end();
  const failed = await childResult(wrong);
  assert.equal(failed.code, 1);
  assert.equal(failed.stdout, "");
  assert.match(failed.stderr, /version does not match/);
  await rm(installed, { recursive: true });
  const missing = spawn(process.execPath, [launcher, "--version"], {
    stdio: "pipe",
  });
  missing.stdin.end();
  const absent = await childResult(missing);
  assert.equal(absent.code, 1);
  assert.match(absent.stderr, /--include=optional/);
});

test(
  "launcher forwards process termination to its child",
  { skip: process.platform === "win32", timeout: 10_000 },
  async (t) => {
    const scratch = await mkdtemp(
      path.join(tmpdir(), "grida-launcher-signal-")
    );
    t.after(() => rm(scratch, { recursive: true, force: true }));
    const { launcher } = await launcherFixture(scratch);
    const child = spawn(
      process.execPath,
      [
        launcher,
        "-e",
        "process.on('SIGTERM',()=>process.exit(19));process.stdout.write('ready');setInterval(()=>{},1000)",
      ],
      { stdio: "pipe" }
    );
    const result = childResult(child);
    child.stdin.end();
    t.after(() => child.kill("SIGKILL"));
    await new Promise((resolve, reject) => {
      child.stdout.once("data", resolve);
      child.once("exit", () =>
        reject(new Error("Fixture exited before signal readiness"))
      );
    });
    child.kill("SIGTERM");
    assert.equal((await result).code, 19);
  }
);
