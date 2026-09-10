import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execute = promisify(execFile);
const require = createRequire(import.meta.url);
const changeset = require.resolve("@changesets/cli/bin.js");
const source = new URL("./publish-packages.mjs", import.meta.url);

async function fixture(run, { private: privateFlag = false } = {}) {
  const root = await realpath(
    await mkdtemp(path.join(tmpdir(), "grida-publish-test-"))
  );
  try {
    for (const directory of [
      "scripts",
      "packages/grida-cli",
      "packages/control",
      "packages/private",
      ".changeset",
      "node_modules/@changesets",
      "bin",
      "home",
      "tmp",
    ])
      await mkdir(path.join(root, directory), { recursive: true });
    await copyFile(source, path.join(root, "scripts/publish-packages.mjs"));
    await symlink(
      path.dirname(changeset),
      path.join(root, "node_modules/@changesets/cli"),
      "dir"
    );
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "publish-fixture",
        private: true,
        packageManager: "pnpm@11.5.2",
      })
    );
    await writeFile(
      path.join(root, "pnpm-workspace.yaml"),
      "packages:\n  - packages/*\n"
    );
    await writeFile(
      path.join(root, ".changeset/config.json"),
      JSON.stringify({
        changelog: false,
        commit: false,
        fixed: [],
        linked: [],
        access: "public",
        baseBranch: "main",
        updateInternalDependencies: "patch",
        ignore: ["grida"],
        privatePackages: { version: true, tag: true },
      })
    );
    const manifest = path.join(root, "packages/grida-cli/package.json");
    // Deliberately non-default formatting and mode prove exact restoration.
    const original = Buffer.from(
      `{ "name": "grida", "version": "1.0.0-preview.1", "private": ${privateFlag}, "description": "synthetic CLI" }\n\n`
    );
    await writeFile(manifest, original, { mode: 0o640 });
    await chmod(manifest, 0o640);
    await writeFile(
      path.join(root, "packages/control/package.json"),
      JSON.stringify({
        name: "@fixture/control",
        version: "2.0.0",
        private: false,
      })
    );
    await writeFile(
      path.join(root, "packages/private/package.json"),
      JSON.stringify({
        name: "@fixture/private",
        version: "3.0.0",
        private: true,
      })
    );
    const report = path.join(root, "commands.jsonl");
    await writeFile(report, "");
    const guard = path.join(root, "guard.cjs");
    await writeFile(
      guard,
      `
const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const { syncBuiltinESMExports } = require('node:module');
function deny() {
  fs.appendFileSync(${JSON.stringify(report)}, JSON.stringify({denied:true}) + '\\n');
  throw new Error('Publication test rejected external authority');
}
globalThis.fetch = async () => deny();
globalThis.WebSocket = class { constructor() { deny(); } };
for (const [name, methods] of [
  ['node:http', ['request','get']], ['node:https', ['request','get']],
  ['node:tls', ['connect']], ['node:http2', ['connect']],
  ['node:dgram', ['createSocket']],
]) for (const method of methods) require(name)[method] = deny;
require('node:net').Socket.prototype.connect = deny;
require('node:net').Server.prototype.listen = deny;
for (const name of ['node:dns','node:dns/promises']) {
  const owner = require(name);
  for (const method of Object.keys(owner).filter(value => /^(lookup|resolve|reverse)/.test(value))) owner[method] = deny;
  owner.Resolver = class { constructor() { deny(); } };
}
const processes = require('node:child_process');
const spawn = processes.spawn;
for (const method of ['exec','execSync','execFile','execFileSync','spawnSync','fork']) processes[method] = deny;
processes.spawn = (file, args, options) => {
  const cli = file === ${JSON.stringify(process.execPath)} && args[0] === ${JSON.stringify(changeset)} && args.length === 2 && args[1] === 'publish';
  if (!cli && !['npm','pnpm','git'].includes(file)) return deny();
  if (cli && process.env.GRIDA_PUBLISH_TEST_SPAWN_ERROR === '1') {
    const failed = new EventEmitter();
    failed.kill = () => false;
    queueMicrotask(() => failed.emit('error', new Error('Synthetic spawn failure')));
    return failed;
  }
  return spawn(file, args, options);
};
if (process.env.GRIDA_PUBLISH_TEST_INTERRUPT_WRITE === '1') {
  const promises = require('node:fs/promises');
  const writeFile = promises.writeFile;
  promises.writeFile = async (file, data, options) => {
    const result = await writeFile(file, data, options);
    if (String(file).endsWith('/packages/grida-cli/package.json') && String(data).includes('"private": true')) {
      const handled = new Promise(resolve => process.once('SIGTERM', resolve));
      const timer = setTimeout(() => { throw new Error('Synthetic SIGTERM was not handled'); }, 1000);
      process.kill(process.pid, 'SIGTERM');
      await handled;
      clearTimeout(timer);
    }
    return result;
  };
}
syncBuiltinESMExports();
`
    );
    const tool = `#!${process.execPath}
import fs from 'node:fs';
import path from 'node:path';
const tool = path.basename(process.argv[1]);
const args = process.argv.slice(2);
const entry = {tool, args};
if (args[0] === 'publish') entry.name = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')).name;
fs.appendFileSync(${JSON.stringify(report)}, JSON.stringify(entry) + '\\n');
if (tool === 'npm' && args[0] === 'info') console.log(JSON.stringify({versions:[]}));
else if (tool === 'pnpm' && args.join(' ') === '--version') console.log('11.5.2');
else if ((tool === 'pnpm' || tool === 'npm') && args[0] === 'publish') {
  if (process.env.GRIDA_PUBLISH_TEST_FAIL === '1') {
    console.error(JSON.stringify({error:{code:'ESYNTHETIC', summary:'Synthetic publish failure'}}));
    process.exitCode = 1;
  } else console.log('{}');
} else if (tool === 'git' && args[0] === 'tag') {}
else if (tool === 'git' && args[0] === 'ls-remote') {}
else { console.error('Unexpected synthetic command'); process.exitCode = 99; }
`;
    for (const name of ["npm", "pnpm", "git"])
      await writeFile(path.join(root, "bin", name), tool, { mode: 0o700 });
    const env = {
      PATH: path.join(root, "bin"),
      HOME: path.join(root, "home"),
      TMPDIR: path.join(root, "tmp"),
      NODE_OPTIONS: `--require ${JSON.stringify(guard)}`,
      CI: "1",
      NO_COLOR: "1",
    };
    const records = async () =>
      (await readFile(report, "utf8"))
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    const invoke = async ({
      wrapped = true,
      extraEnv = {},
      args = [],
    } = {}) => {
      let result;
      try {
        result = await execute(
          process.execPath,
          wrapped
            ? [path.join(root, "scripts/publish-packages.mjs"), ...args]
            : [changeset, "publish"],
          {
            cwd: root,
            env: { ...env, ...extraEnv },
            timeout: 20_000,
            maxBuffer: 1024 * 1024,
          }
        );
        result.code = 0;
      } catch (error) {
        result = error;
      }
      assert(
        !(await records()).some((record) => record.denied),
        "No unplanned network or process authority"
      );
      return result;
    };
    await run({
      root,
      manifest,
      original,
      records,
      invoke,
      clear: () => writeFile(report, ""),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("real Changesets ignores versioning exclusion when publishing; wrapper excludes only grida", async () => {
  await fixture(async ({ manifest, original, invoke, records, clear }) => {
    const unwrapped = await invoke({ wrapped: false });
    assert.equal(unwrapped.code, 0, unwrapped.stderr);
    assert.deepEqual(
      (await records())
        .filter((record) => record.args?.[0] === "publish")
        .map((record) => record.name)
        .sort(),
      ["@fixture/control", "grida"]
    );
    await clear();
    const wrapped = await invoke();
    assert.equal(wrapped.code, 0, wrapped.stderr);
    const commands = await records();
    const published = commands.filter(
      (record) => record.args?.[0] === "publish"
    );
    assert.equal(published.length, 1);
    assert.equal(published[0].name, "@fixture/control");
    assert.deepEqual(published[0].args, [
      "publish",
      "--access",
      "public",
      "--tag",
      "latest",
      "--no-git-checks",
      "--json",
    ]);
    assert(
      !commands.some(
        (record) => record.tool === "npm" && record.args.includes("grida")
      ),
      "CLI must be excluded even from registry discovery"
    );
    assert(
      commands.some(
        (record) =>
          record.tool === "git" &&
          record.args[0] === "tag" &&
          record.args[1] === "@fixture/private@3.0.0"
      ),
      "Other private package tagging stays enabled"
    );
    assert.deepEqual(await readFile(manifest), original);
    assert.equal((await stat(manifest)).mode & 0o777, 0o640);
  });
});

test("publication and spawn failures restore the exact manifest bytes and mode", async () => {
  await fixture(async ({ manifest, original, invoke, clear }) => {
    for (const extraEnv of [
      { GRIDA_PUBLISH_TEST_FAIL: "1" },
      { GRIDA_PUBLISH_TEST_SPAWN_ERROR: "1" },
    ]) {
      await clear();
      const result = await invoke({ extraEnv });
      assert.equal(result.code, 1, result.stderr);
      assert.deepEqual(await readFile(manifest), original);
      assert.equal((await stat(manifest)).mode & 0o777, 0o640);
    }
  });
});

test("SIGTERM during the temporary manifest write restores it without starting publication", async () => {
  await fixture(async ({ manifest, original, invoke, records }) => {
    const result = await invoke({
      extraEnv: { GRIDA_PUBLISH_TEST_INTERRUPT_WRITE: "1" },
    });
    assert.equal(result.code, 1, result.stderr);
    assert.deepEqual(await records(), []);
    assert.deepEqual(await readFile(manifest), original);
    assert.equal((await stat(manifest)).mode & 0o777, 0o640);
  });
});

test("an already private CLI remains unchanged while other packages publish", async () => {
  await fixture(
    async ({ manifest, original, invoke, records }) => {
      const result = await invoke();
      assert.equal(result.code, 0, result.stderr);
      assert.deepEqual(
        (await records())
          .filter((record) => record.args?.[0] === "publish")
          .map((record) => record.name),
        ["@fixture/control"]
      );
      assert.deepEqual(await readFile(manifest), original);
    },
    { private: true }
  );
});

test("invalid CLI identity, implicit private flags and caller arguments fail before publication", async () => {
  await fixture(async ({ manifest, original, invoke, records }) => {
    for (const value of [
      { name: "other", private: false },
      { name: "grida" },
      { name: "grida", private: "false" },
    ]) {
      const bytes = Buffer.from(JSON.stringify(value));
      await writeFile(manifest, bytes);
      assert.equal((await invoke()).code, 1);
      assert.deepEqual(await readFile(manifest), bytes);
    }
    await writeFile(manifest, original);
    assert.equal((await invoke({ args: ["--tag", "next"] })).code, 1);
    assert.deepEqual(await records(), []);
  });
});
