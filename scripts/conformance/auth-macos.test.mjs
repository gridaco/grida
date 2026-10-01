// GRIDA-SEC-010 — pure fixture safety tests; never invoke Security Framework.
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { MacosKeychainFixture } from "./auth-macos.mjs";

function fake(
  t,
  {
    child = () => {},
    fail = () => false,
    lingering = false,
    appleIdentifier = "com.apple.security",
    keychainMode = 0o600,
  } = {}
) {
  const root = realpathSync(
    mkdtempSync(path.join(tmpdir(), "grida-macos-guard-"))
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = {
    CI: "true",
    GITHUB_ACTIONS: "true",
    RUNNER_ENVIRONMENT: "github-hosted",
    RUNNER_OS: "macOS",
    GITHUB_RUN_ID: "1234",
    GITHUB_RUN_ATTEMPT: "1",
    RUNNER_TEMP: root,
    GRIDA_AUTH_MACOS_CI: "1",
    GRIDA_AUTH_KEYRING_SMOKE: "1",
  };
  const original = "/Users/runner/Library/Keychains/login.keychain-db";
  let currentDefault = original;
  let currentSearch = [original, "/Library/Keychains/Another Fixture.keychain"];
  const calls = [];
  const runner = (executable, args, options) => {
    calls.push({ executable, args, options });
    const result = {
      status: 0,
      signal: null,
      stdout: "",
      stderr: "",
      pid: 424242,
    };
    if (executable === "/usr/bin/security") {
      if (args[0] === "create-keychain") {
        writeFileSync(args.at(-1), "synthetic-keychain-file", {
          mode: 0o600,
          flag: "wx",
        });
        chmodSync(args.at(-1), keychainMode);
      }
      if (fail(args))
        return {
          ...result,
          status: 1,
          stderr: "synthetic-password-native-error",
        };
      if (args[0] === "default-keychain") {
        if (args.includes("-s")) currentDefault = args.at(-1);
        else result.stdout = `    ${JSON.stringify(currentDefault)}\n`;
      } else if (args[0] === "list-keychains") {
        if (args.includes("-s")) currentSearch = args.slice(4);
        else
          result.stdout = currentSearch
            .map((entry) => `    ${JSON.stringify(entry)}\n`)
            .join("");
      } else if (args[0] === "delete-keychain") rmSync(args[1]);
    } else if (executable === "/usr/bin/codesign") {
      if (args[0] === "--display")
        result.stderr = `Identifier=${args.at(-1) === "/usr/bin/security" ? appleIdentifier : "fixture"}\nCDHash=${"a".repeat(40)}\n${args.at(-1) === process.execPath ? "TeamIdentifier=ABCDEFGHIJ\n" : ""}`;
      else
        result.status =
          args[1] === "-R=anchor apple"
            ? Number(args.at(-1) !== "/usr/bin/security")
            : Number(args.at(-1) !== process.execPath);
    } else {
      assert.equal(executable, process.execPath);
      assert.equal(options.detached, true);
      const override = child(options.env, runner, calls) || {};
      return {
        ...result,
        stdout: "# tests 5\n# pass 5\n# fail 0\n# skipped 0\n",
        ...override,
      };
    }
    return result;
  };
  const kill = (pid, signal) => {
    calls.push({ kill: [pid, signal] });
    assert.equal(pid, -424242);
    if (signal === 0 && !lingering)
      throw Object.assign(new Error("gone"), { code: "ESRCH" });
  };
  return {
    env,
    runner,
    kill,
    wait: () => {},
    platform: "darwin",
    uid: 501,
    calls,
    original,
    preferences: () => ({ currentDefault, currentSearch }),
  };
}

test("every CI guard rejects before any keychain command", (t) => {
  const setup = fake(t);
  for (const key of [
    "CI",
    "GITHUB_ACTIONS",
    "RUNNER_ENVIRONMENT",
    "RUNNER_OS",
    "GITHUB_RUN_ID",
    "GITHUB_RUN_ATTEMPT",
    "RUNNER_TEMP",
    "GRIDA_AUTH_MACOS_CI",
    "GRIDA_AUTH_KEYRING_SMOKE",
  ]) {
    assert.throws(() =>
      MacosKeychainFixture.run({ ...setup, env: { ...setup.env, [key]: "" } })
    );
  }
  for (const uid of [0, null, -1])
    assert.throws(() => MacosKeychainFixture.run({ ...setup, uid }));
  for (const platform of ["linux", "win32"])
    assert.throws(() => MacosKeychainFixture.run({ ...setup, platform }));
  for (const key of [
    "GRIDA_AUTH_MACOS_FIXTURE",
    "GRIDA_AUTH_CONFORMANCE_BIN",
    "GRIDA_AUTH_KEYTAR_MODULE",
  ])
    assert.throws(() =>
      MacosKeychainFixture.run({
        ...setup,
        env: { ...setup.env, [key]: "/existing" },
      })
    );
  assert.equal(setup.calls.length, 0);
  assert.equal(
    MacosKeychainFixture.load({
      env: {},
      platform: "darwin",
      uid: 501,
      runner: setup.runner,
    }),
    null
  );
  assert.throws(() =>
    MacosKeychainFixture.load({
      env: setup.env,
      platform: "darwin",
      uid: 501,
      runner: setup.runner,
    })
  );
});

test("unsafe created keychain mode remains rejected with safe setup and cleanup stages", (t) => {
  const setup = fake(t, { keychainMode: 0o644 });
  assert.throws(() => MacosKeychainFixture.run(setup), {
    message:
      "Disposable macOS custody failed at created keychain ownership. " +
      "Disposable macOS custody failed at keychain restoration and cleanup.",
  });
  assert(!setup.calls.some((call) => call.executable === process.execPath));
  assert.equal(setup.preferences().currentDefault, setup.original);
});

for (const operation of ["default-keychain", "list-keychains"])
  test(`failed ${operation} snapshot reports only its fixed stage before creating a keychain`, (t) => {
    const setup = fake(t, { fail: (args) => args[0] === operation });
    assert.throws(() => MacosKeychainFixture.run(setup), {
      message: `Disposable macOS custody failed at ${operation === "default-keychain" ? "default" : "search"} keychain snapshot.`,
    });
    assert(!setup.calls.some((call) => call.args?.[0] === "create-keychain"));
  });

test("owned fixture repairs only confirmed exact items and restores preferences", (t) => {
  let marker;
  const setup = fake(t, {
    child(env, runner, calls) {
      marker = env.GRIDA_AUTH_MACOS_FIXTURE;
      const state = JSON.parse(readFileSync(marker, "utf8"));
      const fixture = MacosKeychainFixture.load({
        env,
        platform: "darwin",
        uid: 501,
        runner,
      });
      fixture.initialize("/tmp/rust-fixture");
      const service = `Grida Rust CLI conformance ${randomUUID()}`;
      const account = "synthetic-fixture";
      const label = `Grida conformance fixture ${randomUUID()}`;
      const before = calls.length;
      fixture.prepare(service, account);
      assert.equal(
        calls.length,
        before,
        "absent/unowned entries are never repaired"
      );
      assert.throws(() => fixture.own("real-service", account, label));
      assert.throws(() => fixture.own(service, account, "real-label"));
      fixture.own(service, account, label);
      for (let handoff = 0; handoff < 3; handoff++)
        fixture.prepare(service, account);
      const repairs = calls.filter(
        (call) => call.args?.[0] === "set-generic-password-partition-list"
      );
      assert.equal(
        repairs.length,
        3,
        "every handoff reauthorizes after possible data updates"
      );
      for (const repair of repairs)
        assert.deepEqual(repair.args, [
          "set-generic-password-partition-list",
          "-a",
          account,
          "-s",
          service,
          "-l",
          label,
          "-S",
          `apple-tool:,teamid:ABCDEFGHIJ,cdhash:${"a".repeat(40)}`,
          "-k",
          state.password,
          state.keychain,
        ]);
      fixture.forget(service, account);
      const after = calls.length;
      fixture.prepare(service, account);
      assert.equal(calls.length, after);
      assert.equal(
        state.keychain,
        path.join(path.dirname(marker), "fixture.keychain-db")
      );
    },
  });
  assert.equal(MacosKeychainFixture.run(setup).status, 0);
  assert(!existsSync(path.dirname(marker)));
  assert.deepEqual(setup.preferences(), {
    currentDefault: setup.original,
    currentSearch: [
      setup.original,
      "/Library/Keychains/Another Fixture.keychain",
    ],
  });
  const killIndex = setup.calls.findIndex((call) => call.kill);
  const restoreIndex = setup.calls.findIndex(
    (call, index) => index > killIndex && call.args?.[0] === "default-keychain"
  );
  assert(killIndex >= 0 && restoreIndex > killIndex);
});

test("marker tampering, aliases and mismatched preferences cannot select existing keychains", (t) => {
  const setup = fake(t, {
    child(env, runner) {
      const marker = env.GRIDA_AUTH_MACOS_FIXTURE;
      const state = JSON.parse(readFileSync(marker, "utf8"));
      for (const change of [
        { keychain: "/Users/runner/Library/Keychains/login.keychain-db" },
        { run_id: "other" },
        { password: "" },
      ]) {
        writeFileSync(marker, JSON.stringify({ ...state, ...change }));
        assert.throws(() =>
          MacosKeychainFixture.load({
            env,
            platform: "darwin",
            uid: 501,
            runner,
          })
        );
      }
      writeFileSync(marker, JSON.stringify(state));
      const alias = path.join(path.dirname(marker), "alias.json");
      symlinkSync(marker, alias);
      assert.throws(() =>
        MacosKeychainFixture.load({
          env: { ...env, GRIDA_AUTH_MACOS_FIXTURE: alias },
          platform: "darwin",
          uid: 501,
          runner,
        })
      );
      const wrongPreferences = (executable, args, options) =>
        args[0] === "default-keychain"
          ? { status: 0, stdout: '"/existing/login.keychain-db"\n' }
          : runner(executable, args, options);
      assert.throws(() =>
        MacosKeychainFixture.load({
          env,
          platform: "darwin",
          uid: 501,
          runner: wrongPreferences,
        })
      );
    },
  });
  MacosKeychainFixture.run(setup);
});

for (const failingCommand of [
  "create-keychain",
  "unlock-keychain",
  "set-keychain-settings",
  "default-keychain",
  "list-keychains",
]) {
  test(`partial ${failingCommand} failure still restores and cleans without disclosing passwords`, (t) => {
    let failed = false;
    const setup = fake(t, {
      fail(args) {
        if (
          !failed &&
          args[0] === failingCommand &&
          (!["default-keychain", "list-keychains"].includes(failingCommand) ||
            args.includes("-s"))
        ) {
          failed = true;
          return true;
        }
        return false;
      },
    });
    assert.throws(() => MacosKeychainFixture.run(setup), {
      message: `Disposable macOS custody failed at ${
        {
          "create-keychain": "keychain creation",
          "unlock-keychain": "keychain unlock",
          "set-keychain-settings": "keychain settings",
          "default-keychain": "default keychain selection",
          "list-keychains": "search keychain selection",
        }[failingCommand]
      }.`,
    });
    assert(failed);
    assert.deepEqual(setup.preferences(), {
      currentDefault: setup.original,
      currentSearch: [
        setup.original,
        "/Library/Keychains/Another Fixture.keychain",
      ],
    });
    assert(setup.calls.some((call) => call.args?.[0] === "delete-keychain"));
  });
}

test("test timeout kills its process group before restore and preserves failed status", (t) => {
  const setup = fake(t, {
    child: () => ({
      status: null,
      signal: "SIGTERM",
      error: Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }),
    }),
  });
  assert.equal(MacosKeychainFixture.run(setup).error.code, "ETIMEDOUT");
  assert.deepEqual(
    setup.calls.filter((call) => call.kill).map((call) => call.kill),
    [
      [-424242, "SIGKILL"],
      [-424242, 0],
    ]
  );
  assert.equal(setup.preferences().currentDefault, setup.original);
});

test("unconfirmed process termination keeps children confined until runner disposal", (t) => {
  const setup = fake(t, { lingering: true });
  assert.throws(() => MacosKeychainFixture.run(setup), /children may remain/);
  assert.notEqual(setup.preferences().currentDefault, setup.original);
  assert(!setup.calls.some((call) => call.args?.[0] === "delete-keychain"));
});

test("restoration failure does not prevent remaining cleanup attempts", (t) => {
  let childFinished = false;
  const setup = fake(t, {
    child() {
      childFinished = true;
    },
    fail: (args) =>
      childFinished && args[0] === "default-keychain" && args.includes("-s"),
  });
  assert.throws(() => MacosKeychainFixture.run(setup), {
    message:
      "Disposable macOS custody failed at keychain restoration and cleanup.",
  });
  assert.deepEqual(setup.preferences().currentSearch, [
    setup.original,
    "/Library/Keychains/Another Fixture.keychain",
  ]);
  assert(setup.calls.some((call) => call.args?.[0] === "delete-keychain"));
});

test("Apple creator partition is derived instead of assuming its identifier", (t) => {
  const setup = fake(t, {
    appleIdentifier: "com.apple.other-security-tool",
    child(env, runner) {
      const fixture = MacosKeychainFixture.load({
        env,
        platform: "darwin",
        uid: 501,
        runner,
      });
      fixture.initialize("/tmp/rust-fixture");
      assert(fixture.partitions.startsWith("apple:,"));
    },
  });
  MacosKeychainFixture.run(setup);
});
