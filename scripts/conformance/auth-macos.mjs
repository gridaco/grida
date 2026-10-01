// GRIDA-SEC-010 — synthetic native custody in an exclusive GitHub-hosted runner.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const uuid = "[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}";
const developer =
  "anchor apple generic and (certificate leaf[field.1.2.840.113635.100.6.1.9] exists or certificate 1[field.1.2.840.113635.100.6.2.6] exists and certificate leaf[field.1.2.840.113635.100.6.1.13] exists or certificate 1[field.1.2.840.113635.100.6.2.1] exists and (certificate leaf[field.1.2.840.113635.100.6.1.12] exists or certificate leaf[field.1.2.840.113635.100.6.1.7] exists))";

function command(runner, executable, args, env) {
  try {
    const result = runner(executable, args, {
      cwd: repository,
      env,
      encoding: "utf8",
      timeout: 60000,
      maxBuffer: 65536,
    });
    assert(!result.error && !result.signal && Number.isInteger(result.status));
    return result;
  } catch {
    // Never put password-bearing arguments or native diagnostics in exceptions.
    throw new Error("macOS fixture command could not complete");
  }
}
function security(runner, args, env) {
  const result = command(runner, "/usr/bin/security", args, env);
  assert(result.status === 0, "macOS fixture keychain operation failed");
  return result.stdout;
}
function keychainPaths(output) {
  const paths = output
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line.trim()));
  assert(
    paths.every((value) => typeof value === "string" && path.isAbsolute(value)),
    "Invalid keychain preference snapshot"
  );
  return paths;
}
function privatePath(filename, directory = false) {
  const stat = lstatSync(filename);
  assert(
    !stat.isSymbolicLink() &&
      (directory ? stat.isDirectory() : stat.isFile()) &&
      stat.uid === process.getuid() &&
      (stat.mode & 0o077) === 0,
    "Invalid macOS fixture ownership"
  );
  assert(realpathSync(filename) === filename, "Aliased macOS fixture path");
}
function stopGroup(result, kill, wait) {
  if (!result.pid && result.error) return;
  assert(
    Number.isInteger(result.pid) && result.pid > 0,
    "Missing owned fixture process group"
  );
  try {
    kill(-result.pid, "SIGKILL");
  } catch (error) {
    if (error.code === "ESRCH") return;
    throw error;
  }
  // spawnSync has reaped the group leader. Wait for any descendant to disappear
  // before restoring preferences used by the production adapters' NULL queries.
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      kill(-result.pid, 0);
    } catch (error) {
      if (error.code === "ESRCH") return;
      throw error;
    }
    wait();
  }
  throw new Error("Owned fixture process group did not terminate");
}

export class MacosKeychainFixture {
  static guard(env, platform, uid) {
    assert(
      platform === "darwin" &&
        Number.isInteger(uid) &&
        uid > 0 &&
        env.GRIDA_AUTH_MACOS_CI === "1" &&
        env.GRIDA_AUTH_KEYRING_SMOKE === "1" &&
        env.CI === "true" &&
        env.GITHUB_ACTIONS === "true" &&
        env.RUNNER_ENVIRONMENT === "github-hosted" &&
        env.RUNNER_OS === "macOS" &&
        /^\d+$/.test(env.GITHUB_RUN_ID || "") &&
        /^\d+$/.test(env.GITHUB_RUN_ATTEMPT || "") &&
        path.isAbsolute(env.RUNNER_TEMP || ""),
      "Private macOS custody requires explicit GitHub-hosted macOS CI opt-in"
    );
  }

  static run({
    env = process.env,
    platform = process.platform,
    uid = process.getuid?.(),
    runner = spawnSync,
    kill = process.kill.bind(process),
    wait = () =>
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20),
  } = {}) {
    this.guard(env, platform, uid);
    assert(
      !env.GRIDA_AUTH_MACOS_FIXTURE,
      "Nested macOS fixtures are not allowed"
    );
    assert(
      !env.GRIDA_AUTH_CONFORMANCE_BIN && !env.GRIDA_AUTH_KEYTAR_MODULE,
      "CI custody must use the built Rust driver and installed keytar"
    );
    const root = realpathSync(env.RUNNER_TEMP);
    const directory = realpathSync(
      mkdtempSync(path.join(root, "grida-auth-macos-"))
    );
    const filename = path.join(directory, "fixture.json");
    const state = {
      version: 1,
      run_id: env.GITHUB_RUN_ID,
      run_attempt: env.GITHUB_RUN_ATTEMPT,
      nonce: randomUUID(),
      password: randomBytes(32).toString("hex"),
      keychain: path.join(directory, "fixture.keychain-db"),
    };
    let defaults;
    let search;
    let creationStarted = false;
    let testGroupSettled = true;
    try {
      privatePath(directory, true);
      assert(!existsSync(state.keychain), "Fixture keychain must not exist");
      writeFileSync(filename, JSON.stringify(state), {
        mode: 0o600,
        flag: "wx",
      });
      defaults = keychainPaths(
        security(runner, ["default-keychain", "-d", "user"], env)
      );
      assert(defaults.length === 1, "Expected one runner default keychain");
      search = keychainPaths(
        security(runner, ["list-keychains", "-d", "user"], env)
      );
      creationStarted = true;
      security(
        runner,
        ["create-keychain", "-p", state.password, state.keychain],
        env
      );
      privatePath(state.keychain);
      security(
        runner,
        ["unlock-keychain", "-p", state.password, state.keychain],
        env
      );
      security(
        runner,
        ["set-keychain-settings", "-t", "3600", state.keychain],
        env
      );
      security(
        runner,
        ["default-keychain", "-d", "user", "-s", state.keychain],
        env
      );
      security(
        runner,
        ["list-keychains", "-d", "user", "-s", state.keychain],
        env
      );
      // The real adapters use the runner's default keychain. Only this disposable
      // runner's preferences change; no developer invocation may enter this path.
      testGroupSettled = false;
      const result = runner(
        process.execPath,
        ["--test", "scripts/conformance/auth-keyring.test.mjs"],
        {
          cwd: repository,
          env: { ...env, GRIDA_AUTH_MACOS_FIXTURE: filename },
          encoding: "utf8",
          timeout: 12 * 60 * 1000,
          maxBuffer: 4 * 1024 * 1024,
          detached: true,
        }
      );
      stopGroup(result, kill, wait);
      testGroupSettled = true;
      return result;
    } finally {
      // Abrupt CI cancellation is handled by disposable-runner destruction.
      // Do not expose surviving fixture children to restored runner credentials.
      assert(
        testGroupSettled,
        "Fixture children may remain; retain private keychain until runner disposal"
      );
      const failures = [];
      const cleanup = (fn) => {
        try {
          fn();
        } catch {
          failures.push(true);
        }
      };
      if (creationStarted) {
        cleanup(() =>
          security(
            runner,
            ["default-keychain", "-d", "user", "-s", ...defaults],
            env
          )
        );
        cleanup(() =>
          security(
            runner,
            ["list-keychains", "-d", "user", "-s", ...search],
            env
          )
        );
        if (existsSync(state.keychain))
          cleanup(() => {
            privatePath(state.keychain);
            security(runner, ["delete-keychain", state.keychain], env);
          });
      }
      cleanup(() => rmSync(directory, { recursive: true, force: true }));
      assert(
        failures.length === 0,
        "Could not completely restore and remove the disposable macOS keychain"
      );
    }
  }

  static load({
    env = process.env,
    platform = process.platform,
    uid = process.getuid?.(),
    runner = spawnSync,
  } = {}) {
    if (!env.GRIDA_AUTH_MACOS_FIXTURE) {
      assert(
        env.GRIDA_AUTH_MACOS_CI !== "1",
        "Run macOS CI custody through auth-macos.mjs"
      );
      return null;
    }
    this.guard(env, platform, uid);
    const filename = env.GRIDA_AUTH_MACOS_FIXTURE;
    const directory = path.dirname(filename);
    assert(
      path.isAbsolute(filename) &&
        path.basename(filename) === "fixture.json" &&
        path.dirname(directory) === realpathSync(env.RUNNER_TEMP) &&
        /^grida-auth-macos-[A-Za-z0-9]+$/.test(path.basename(directory)),
      "Invalid macOS fixture location"
    );
    privatePath(directory, true);
    privatePath(filename);
    assert(lstatSync(filename).size < 2048, "Invalid macOS fixture marker");
    const state = JSON.parse(readFileSync(filename, "utf8"));
    assert(
      state.version === 1 &&
        state.run_id === env.GITHUB_RUN_ID &&
        state.run_attempt === env.GITHUB_RUN_ATTEMPT &&
        new RegExp(`^${uuid}$`).test(state.nonce) &&
        /^[0-9a-f]{64}$/.test(state.password) &&
        state.keychain === path.join(directory, "fixture.keychain-db"),
      "Invalid macOS fixture marker"
    );
    privatePath(state.keychain);
    assert(
      JSON.stringify(
        keychainPaths(security(runner, ["default-keychain", "-d", "user"], env))
      ) === JSON.stringify([state.keychain]) &&
        JSON.stringify(
          keychainPaths(security(runner, ["list-keychains", "-d", "user"], env))
        ) === JSON.stringify([state.keychain]),
      "Runner keychain preferences do not match the owned fixture"
    );
    return new MacosKeychainFixture(state, env, runner);
  }

  constructor(state, env, runner) {
    this.state = Object.freeze(state);
    this.env = env;
    this.runner = runner;
    this.entries = new Map();
  }

  initialize(rustExecutable) {
    const partition = (executable) => {
      assert(
        path.isAbsolute(executable),
        "Expected an absolute fixture executable"
      );
      const info = command(
        this.runner,
        "/usr/bin/codesign",
        ["--display", "--verbose=4", executable],
        this.env
      );
      if (info.status !== 0) {
        assert(
          info.status === 1 &&
            /code object is not signed at all/.test(info.stderr),
          "Cannot identify fixture executable"
        );
        return "unsigned:";
      }
      const hash = /^CDHash=([0-9a-f]{40})$/m.exec(info.stderr)?.[1];
      const team = /^TeamIdentifier=([A-Z0-9]{10})$/m.exec(info.stderr)?.[1];
      assert(hash, "Missing fixture code signature hash");
      if (
        command(
          this.runner,
          "/usr/bin/codesign",
          ["--verify", "-R=anchor apple", executable],
          this.env
        ).status === 0
      )
        return /^Identifier=com\.apple\.security$/m.test(info.stderr)
          ? "apple-tool:"
          : "apple:";
      if (
        team &&
        command(
          this.runner,
          "/usr/bin/codesign",
          ["--verify", `-R=${developer}`, executable],
          this.env
        ).status === 0
      )
        return `teamid:${team}`;
      return `cdhash:${hash}`;
    };
    this.partitions = [
      ...new Set([
        partition("/usr/bin/security"),
        partition(process.execPath),
        partition(rustExecutable),
      ]),
    ].join(",");
  }

  get keychain() {
    return this.state.keychain;
  }

  own(service, account, label) {
    assert(
      (new RegExp(`^Grida Rust CLI conformance ${uuid}$`).test(service) &&
        account === "synthetic-fixture") ||
        (service === "Grida Native Auth" && /^[0-9a-f]{64}$/.test(account)),
      "Invalid fixture item identity"
    );
    assert(
      new RegExp(`^Grida conformance fixture ${uuid}$`).test(label),
      "Invalid fixture item label"
    );
    // The caller registers only after successful creation. Check its exact
    // metadata in the owned keychain before authorizing any partition change.
    security(
      this.runner,
      [
        "find-generic-password",
        "-a",
        account,
        "-s",
        service,
        "-l",
        label,
        this.keychain,
      ],
      this.env
    );
    this.entries.set(JSON.stringify([service, account]), label);
  }

  prepare(service, account) {
    const label = this.entries.get(JSON.stringify([service, account]));
    if (!label) return;
    assert(this.partitions, "Fixture executables must be identified first");
    privatePath(this.keychain);
    security(
      this.runner,
      [
        "set-generic-password-partition-list",
        "-a",
        account,
        "-s",
        service,
        "-l",
        label,
        "-S",
        this.partitions,
        "-k",
        this.state.password,
        this.keychain,
      ],
      this.env
    );
  }

  forget(service, account) {
    this.entries.delete(JSON.stringify([service, account]));
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result = MacosKeychainFixture.run();
    process.stdout.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    process.exitCode = result.error || result.signal ? 1 : (result.status ?? 1);
  } catch {
    process.stderr.write(
      "Disposable macOS custody setup, test, or cleanup failed.\n"
    );
    process.exitCode = 1;
  }
}
