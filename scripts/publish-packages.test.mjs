import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execute = promisify(execFile);
const source = new URL("./publish-packages.mjs", import.meta.url);
const target = ["@fixture/selected", "2.0.0"];

async function fixture(run) {
  const temporary = await realpath(
    await mkdtemp(path.join(tmpdir(), "grida-publish-test-"))
  );
  const root = path.join(temporary, "repository");
  try {
    for (const directory of [
      "scripts",
      "packages/selected",
      "packages/control",
      "packages/cli",
      "packages/private",
      "bin",
      "home",
      "tmp",
      "packed/package",
    ])
      await mkdir(path.join(root, directory), { recursive: true });
    await copyFile(source, path.join(root, "scripts/publish-packages.mjs"));
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "fixture",
        private: true,
        packageManager: "pnpm@11.5.2",
      })
    );
    await writeFile(
      path.join(root, "pnpm-workspace.yaml"),
      "packages:\n  - packages/*\n"
    );
    const packages = [
      ["selected", "@fixture/selected", "2.0.0", false],
      ["control", "@fixture/control", "3.0.0", false],
      ["cli", "grida", "4.0.0", false],
      ["private", "@fixture/private", "5.0.0", true],
    ];
    const inventory = [];
    for (const [directory, name, version, privateFlag] of packages) {
      const location = path.join(root, "packages", directory);
      const manifest = path.join(location, "package.json");
      await writeFile(
        manifest,
        JSON.stringify({ name, version, private: privateFlag }, null, 4) +
          "\n\n"
      );
      await chmod(manifest, 0o640);
      inventory.push({ name, version, path: location, private: privateFlag });
    }
    const packed = path.join(root, "packed-manifest.json");
    const fixtureArchive = path.join(root, "canonical.tgz");
    await writeFile(
      packed,
      JSON.stringify({ name: target[0], version: target[1], private: false })
    );
    await symlink("/usr/bin/tar", path.join(root, "bin/tar"));
    // GNU tar launches gzip through PATH when reading .tgz fixtures.
    await symlink("/usr/bin/gzip", path.join(root, "bin/gzip"));
    const list = path.join(root, "inventory.json");
    await writeFile(list, JSON.stringify(inventory));
    const report = path.join(root, "commands.jsonl");
    await writeFile(report, "");
    // Children can invoke only the pnpm fixture and read a scratch archive
    // with tar. Neither operation can reach a registry.
    const guard = path.join(root, "guard.cjs");
    await writeFile(
      guard,
      `
const fs = require('node:fs');
const processes = require('node:child_process');
const {syncBuiltinESMExports} = require('node:module');
function deny() {
  fs.appendFileSync(${JSON.stringify(report)}, JSON.stringify({denied:true}) + '\\n');
  throw new Error('Publication test denied external authority');
}
globalThis.fetch = deny;
for (const [name, methods] of [['node:http',['request','get']],['node:https',['request','get']],['node:tls',['connect']],['node:http2',['connect']],['node:dgram',['createSocket']]])
  for (const method of methods) require(name)[method] = deny;
require('node:net').Socket.prototype.connect = deny;
for (const method of ['exec','execSync','execFile','execFileSync','spawnSync','fork']) processes[method] = deny;
const spawn = processes.spawn;
processes.spawn = (file, args, options) => {
  if (file === 'tar' && args.length === 3 && args[0] === '-xOf' && args[1].startsWith(${JSON.stringify(path.join(root, "tmp") + path.sep)}) && args[2] === 'package/package.json') return spawn(file,args,options);
  if (file !== 'pnpm') return deny();
  if (args[0] === 'publish' && process.env.PUBLISH_TEST_SPAWN_FAILURE === '1') {
    const child = new (require('node:events').EventEmitter)();
    child.kill = () => false;
    queueMicrotask(() => child.emit('error', new Error('Synthetic spawn failure')));
    return child;
  }
  return spawn(file,args,options);
};
syncBuiltinESMExports();
`
    );
    await writeFile(
      path.join(root, "bin/pnpm"),
      `#!${process.execPath}
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const args = process.argv.slice(2);
const entry = {args, cwd: process.cwd()};
entry.isolatedNpmConfig = fs.readFileSync(process.env.npm_config_userconfig,'utf8') === '' && fs.readFileSync(process.env.npm_config_globalconfig,'utf8') === '';
entry.registry = process.env.npm_config_registry;
entry.oidc = !!(process.env.ACTIONS_ID_TOKEN_REQUEST_URL && process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN);
if (args[0] === 'pack' && process.env.PUBLISH_TEST_INTERRUPT !== 'pack' && process.env.PUBLISH_TEST_PACK_FAIL !== '1') {
  entry.archive = args[args.indexOf('--out')+1];
  fs.copyFileSync(${JSON.stringify(fixtureArchive)},entry.archive);
}
if (args[0] === 'publish') {
  entry.archive = args[1];
  entry.name = JSON.parse(fs.readFileSync(${JSON.stringify(packed)},'utf8')).name;
}
if (entry.archive) entry.digest = createHash('sha256').update(fs.readFileSync(entry.archive)).digest('hex');
fs.appendFileSync(${JSON.stringify(report)}, JSON.stringify(entry) + '\\n');
if (process.env.PUBLISH_TEST_INTERRUPT === args[0]) {
  process.kill(process.ppid,process.env.PUBLISH_TEST_SIGNAL || 'SIGTERM');
  setInterval(() => {},1000);
} else if (args.join(' ') === '--version') console.log(process.env.PUBLISH_TEST_PNPM_VERSION || '11.5.2');
else if (args.join(' ') === 'list --recursive --depth -1 --json') console.log(fs.readFileSync(${JSON.stringify(list)},'utf8'));
else if (args[0] === 'pack' && args.length === 4 && args[1] === '--out' && args[3] === '--no-recursive') process.exitCode = process.env.PUBLISH_TEST_PACK_FAIL === '1' ? 23 : 0;
else if (args[0] === 'view' && args.length === 6 && args.slice(2).join(' ') === 'version --json --registry https://registry.npmjs.org') {
  if (process.env.PUBLISH_TEST_VIEW_FAIL === '1') process.exitCode = 23;
  else console.log(process.env.PUBLISH_TEST_VIEW_JSON || JSON.stringify(JSON.parse(process.env.PUBLISH_TEST_VERSIONS || '{}')[args[1]] || '3.0.0'));
} else if (args.join(' ').startsWith('run --if-present --config.enable-pre-post-scripts=false ')) process.exitCode = process.env.PUBLISH_TEST_HOOK_FAIL === args[3] ? 23 : 0;
else if (args[0] === 'publish' && args.slice(2).join(' ') === '--access public --tag latest --no-git-checks --no-recursive') process.exitCode = process.env.PUBLISH_TEST_FAIL === '1' ? 23 : 0;
else { console.error('Unexpected fixture command'); process.exitCode = 99; }
`,
      { mode: 0o700 }
    );
    const env = {
      PATH: path.join(root, "bin"),
      HOME: path.join(root, "home"),
      TMPDIR: path.join(root, "tmp"),
      NODE_OPTIONS: `--require ${JSON.stringify(guard)}`,
      CI: "1",
      GITHUB_ACTIONS: "true",
      GITHUB_REPOSITORY: "gridaco/grida",
      GITHUB_REF: "refs/heads/main",
      ACTIONS_ID_TOKEN_REQUEST_URL: "https://oidc.example.invalid/token",
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: "synthetic-job-token",
    };
    const records = async () =>
      (await readFile(report, "utf8"))
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    const snapshot = async () =>
      Promise.all(
        [
          "package.json",
          ...packages.map(
            ([directory]) => `packages/${directory}/package.json`
          ),
        ].map(async (relative) => {
          const filename = path.join(root, relative);
          return {
            relative,
            bytes: await readFile(filename),
            mode: (await stat(filename)).mode & 0o777,
          };
        })
      );
    const invoke = async ({ args = target, extraEnv = {} } = {}) => {
      await copyFile(packed, path.join(root, "packed/package/package.json"));
      await execute("/usr/bin/tar", [
        "-czf",
        fixtureArchive,
        "-C",
        path.join(root, "packed"),
        "package",
      ]);
      const before = await snapshot();
      let result;
      try {
        result = await execute(
          process.execPath,
          [path.join(root, "scripts/publish-packages.mjs"), ...args],
          {
            cwd: root,
            env: { ...env, ...extraEnv },
            timeout: 10_000,
            maxBuffer: 1024 * 1024,
          }
        );
        result.code = 0;
      } catch (error) {
        result = error;
      }
      assert.deepEqual(
        await snapshot(),
        before,
        "Every manifest retains its exact bytes and mode"
      );
      assert(
        !(await records()).some((record) => record.denied),
        "No unplanned process or network access"
      );
      const commands = await records();
      for (const command of commands) {
        assert.equal(command.isolatedNpmConfig, true);
        assert.equal(command.oidc, true);
        assert.equal(command.registry, "https://registry.npmjs.org");
      }
      // Scratch npm configuration is removed on success, failure and signals.
      assert.deepEqual(await readdir(path.join(root, "tmp")), []);
      for (const command of commands)
        assert(
          !command.args.includes("--recursive") || command.args[0] === "list"
        );
      return result;
    };
    await run({
      root,
      temporary,
      inventory,
      packed,
      list,
      invoke,
      records,
      clear: () => writeFile(report, ""),
    });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

test("publication selects one exact public workspace and preserves unrelated packages and the CLI", async () => {
  await fixture(async ({ root, invoke, records }) => {
    const result = await invoke();
    assert.equal(result.code, 0, result.stderr);
    const commands = await records();
    assert.deepEqual(
      commands.map((command) => command.args[0]),
      ["--version", "list", "pack", "publish"]
    );
    const publish = commands.at(-1);
    const pack = commands.find((command) => command.args[0] === "pack");
    assert.equal(publish.archive, pack.archive);
    assert.equal(publish.digest, pack.digest);
    assert.equal(publish.name, target[0]);
    assert.equal(publish.cwd, path.join(root, "packages/selected"));
    assert.deepEqual(publish.args, [
      "publish",
      commands.find((command) => command.args[0] === "pack").archive,
      "--access",
      "public",
      "--tag",
      "latest",
      "--no-git-checks",
      "--no-recursive",
    ]);
  });
});

test("check validates the same exact release without publishing", async () => {
  await fixture(async ({ invoke, records, clear }) => {
    const result = await invoke({ args: ["--check", ...target] });
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(
      (await records()).map((command) => command.args[0]),
      ["--version", "list"]
    );
    await clear();
    assert.equal(
      (await invoke({ args: ["--check", target[0], "2.0.1"] })).code,
      1
    );
    assert(!(await records()).some((command) => command.args[0] === "publish"));
  });
});

test("missing, ambiguous, prerelease and option-shaped release arguments fail before invoking pnpm", async () => {
  await fixture(async ({ invoke, records }) => {
    for (const args of [
      [],
      [target[0]],
      [...target, "extra"],
      ["--all", "2.0.0"],
      ["../selected", "2.0.0"],
      [target[0], "latest"],
      [target[0], "^2.0.0"],
      [target[0], "2.0.0-preview.1"],
      [target[0], "2.0.0+build"],
      [target[0], "02.0.0"],
      ["grida", "4.0.0"],
    ]) {
      assert.equal((await invoke({ args })).code, 1);
      assert.deepEqual(await records(), []);
    }
  });
});

test("GitHub main OIDC is required and token fallback is rejected before invoking pnpm", async () => {
  await fixture(async ({ invoke, records }) => {
    for (const extraEnv of [
      { GITHUB_ACTIONS: "false" },
      { GITHUB_REPOSITORY: "other/grida" },
      { GITHUB_REF: "refs/heads/canary" },
      { GITHUB_REF: "refs/pull/1/merge" },
      { ACTIONS_ID_TOKEN_REQUEST_URL: "" },
      { ACTIONS_ID_TOKEN_REQUEST_TOKEN: "" },
      { NPM_TOKEN: "synthetic" },
      { NODE_AUTH_TOKEN: "synthetic" },
      { NPM_ID_TOKEN: "synthetic" },
    ]) {
      assert.equal((await invoke({ extraEnv })).code, 1);
      assert.deepEqual(await records(), []);
    }
  });
});

test("unknown, duplicate, root, outside and symlinked-outside workspace paths cannot publish", async () => {
  await fixture(
    async ({ root, temporary, inventory, list, invoke, records, clear }) => {
      const outside = path.join(temporary, "outside");
      await mkdir(outside);
      const linked = path.join(root, "packages/linked");
      await symlink(outside, linked, "dir");
      for (const entries of [
        [],
        [inventory[0], inventory[0]],
        [{ ...inventory[0], path: root }],
        [{ ...inventory[0], path: outside }],
        [{ ...inventory[0], path: linked }],
      ]) {
        await clear();
        await writeFile(list, JSON.stringify(entries));
        assert.equal((await invoke()).code, 1);
        assert(
          !(await records()).some((command) => command.args[0] === "publish")
        );
      }
    }
  );
});

test("private packages, mismatched manifests and stale committed versions cannot publish", async () => {
  await fixture(async ({ root, invoke, records, clear }) => {
    assert.equal(
      (await invoke({ args: ["@fixture/private", "5.0.0"] })).code,
      1
    );
    const manifest = path.join(root, "packages/selected/package.json");
    for (const value of [
      { name: target[0], version: "2.0.1", private: false },
      { name: "@fixture/other", version: target[1], private: false },
      { name: target[0], version: target[1] },
      { name: target[0], version: target[1], private: "false" },
    ]) {
      await clear();
      await writeFile(manifest, JSON.stringify(value));
      assert.equal((await invoke()).code, 1);
      assert(
        !(await records()).some((command) => command.args[0] === "publish")
      );
    }
  });
});

test("the actual pnpm version must match the repository pin", async () => {
  await fixture(async ({ invoke, records }) => {
    assert.equal(
      (await invoke({ extraEnv: { PUBLISH_TEST_PNPM_VERSION: "10.0.0" } }))
        .code,
      1
    );
    assert.deepEqual(
      (await records()).map((command) => command.args[0]),
      ["--version"]
    );
  });
});

test("publication errors and spawn failures fail without changing any manifest", async () => {
  await fixture(async ({ invoke, clear }) => {
    for (const extraEnv of [
      { PUBLISH_TEST_PACK_FAIL: "1" },
      { PUBLISH_TEST_FAIL: "1" },
      { PUBLISH_TEST_SPAWN_FAILURE: "1" },
    ]) {
      await clear();
      assert.equal((await invoke({ extraEnv })).code, 1);
    }
  });
});

test("cancellation during discovery or packing never uploads; cancellation during upload fails", async () => {
  await fixture(async ({ invoke, records, clear }) => {
    for (const stage of ["list", "pack", "publish"])
      for (const signal of ["SIGINT", "SIGTERM"]) {
        await clear();
        assert.equal(
          (
            await invoke({
              extraEnv: {
                PUBLISH_TEST_INTERRUPT: stage,
                PUBLISH_TEST_SIGNAL: signal,
              },
            })
          ).code,
          1
        );
        const publications = (await records()).filter(
          (command) => command.args[0] === "publish"
        );
        assert.equal(publications.length, stage === "publish" ? 1 : 0);
      }
  });
});

async function dependencies({ root, packed }, original, published) {
  const filename = path.join(root, "packages/selected/package.json");
  const manifest = JSON.parse(await readFile(filename, "utf8"));
  await writeFile(filename, JSON.stringify({ ...manifest, ...original }));
  await writeFile(
    packed,
    JSON.stringify({
      name: target[0],
      version: target[1],
      private: false,
      ...published,
    })
  );
}

test("a required workspace runtime dependency must have a published matching version before upload", async () => {
  await fixture(async (context) => {
    await dependencies(
      context,
      { dependencies: { "@fixture/control": "workspace:*" } },
      { dependencies: { "@fixture/control": "3.0.0" } }
    );
    for (const extraEnv of [
      { PUBLISH_TEST_VIEW_FAIL: "1" },
      { PUBLISH_TEST_VIEW_JSON: "[]" },
      { PUBLISH_TEST_VIEW_JSON: "null" },
      { PUBLISH_TEST_VIEW_JSON: "{}" },
      { PUBLISH_TEST_VIEW_JSON: '""' },
      { PUBLISH_TEST_VIEW_JSON: "not-json" },
    ]) {
      await context.clear();
      assert.equal((await context.invoke({ extraEnv })).code, 1);
      const commands = await context.records();
      assert.equal(
        commands.filter((command) => command.args[0] === "view").length,
        1
      );
      assert(!commands.some((command) => command.args[0] === "publish"));
    }
  });
});

test("canonical packed ranges and npm aliases are checked instead of requiring unpublished local workspace versions", async () => {
  await fixture(async (context) => {
    await dependencies(
      context,
      {
        dependencies: {
          "@fixture/control": "workspace:*",
          alias: "workspace:@fixture/control@~",
          registryAlias: "npm:@fixture/control@^3.0.0",
        },
        publishConfig: { dependencies: { "@fixture/control": "^2.0.0" } },
      },
      {
        dependencies: {
          "@fixture/control": "^2.0.0",
          alias: "npm:@fixture/control@~3.0.0",
          registryAlias: "npm:@fixture/control@^3.0.0",
        },
      }
    );
    const result = await context.invoke({
      extraEnv: {
        PUBLISH_TEST_VERSIONS: JSON.stringify({
          "@fixture/control@^2.0.0": "2.5.0",
          "alias@npm:@fixture/control@~3.0.0": "3.0.1",
          "registryAlias@npm:@fixture/control@^3.0.0": "3.1.0",
        }),
      },
    });
    assert.equal(result.code, 0, result.stderr);
    const commands = await context.records();
    assert.deepEqual(
      commands
        .filter((command) => command.args[0] === "view")
        .map((command) => command.args),
      [
        [
          "view",
          "@fixture/control@^2.0.0",
          "version",
          "--json",
          "--registry",
          "https://registry.npmjs.org",
        ],
        [
          "view",
          "alias@npm:@fixture/control@~3.0.0",
          "version",
          "--json",
          "--registry",
          "https://registry.npmjs.org",
        ],
        [
          "view",
          "registryAlias@npm:@fixture/control@^3.0.0",
          "version",
          "--json",
          "--registry",
          "https://registry.npmjs.org",
        ],
      ]
    );
    const pack = commands.find((command) => command.args[0] === "pack");
    const publish = commands.find((command) => command.args[0] === "publish");
    assert.equal(publish.archive, pack.archive);
    assert.equal(publish.digest, pack.digest);
  });
});

test("optional overrides, bundled dependencies, dev dependencies and peers do not block runtime workspace validation", async () => {
  await fixture(async (context) => {
    await dependencies(
      context,
      {
        dependencies: {
          "@fixture/control": "workspace:*",
          alias: "workspace:@fixture/control@*",
          external: "^1.0.0",
        },
        devDependencies: { "@fixture/private": "workspace:*" },
        peerDependencies: { "@fixture/peer": "workspace:*" },
      },
      {
        dependencies: {
          "@fixture/control": "3.0.0",
          alias: "npm:@fixture/control@3.0.0",
          external: "^1.0.0",
        },
        optionalDependencies: { "@fixture/control": "9.0.0" },
        bundledDependencies: ["alias"],
        devDependencies: { "@fixture/private": "5.0.0" },
        peerDependencies: { "@fixture/peer": "99.0.0" },
      }
    );
    const result = await context.invoke({
      extraEnv: { PUBLISH_TEST_VIEW_FAIL: "1" },
    });
    assert.equal(result.code, 0, result.stderr);
    assert(
      !(await context.records()).some((command) => command.args[0] === "view")
    );
  });
});

test("both bundle field spellings and boolean bundling exclude bundled runtime dependencies", async () => {
  await fixture(async (context) => {
    for (const field of ["bundleDependencies", "bundledDependencies"])
      for (const bundled of [true, ["@fixture/control"]]) {
        await context.clear();
        await dependencies(
          context,
          { dependencies: { "@fixture/control": "workspace:*" } },
          { dependencies: { "@fixture/control": "3.0.0" }, [field]: bundled }
        );
        const result = await context.invoke({
          extraEnv: { PUBLISH_TEST_VIEW_FAIL: "1" },
        });
        assert.equal(result.code, 0, result.stderr);
        assert(
          !(await context.records()).some(
            (command) => command.args[0] === "view"
          )
        );
      }
  });
});

test("the packed package must retain the selected name, version and public status", async () => {
  await fixture(async (context) => {
    for (const changed of [
      { name: "@fixture/other" },
      { version: "2.0.1" },
      { private: true },
    ]) {
      await context.clear();
      await dependencies(context, {}, changed);
      assert.equal((await context.invoke()).code, 1);
      assert(
        !(await context.records()).some(
          (command) => command.args[0] === "publish"
        )
      );
    }
  });
});

test("outer publication hooks preserve normal order without automatic pre/post duplication", async () => {
  await fixture(async (context) => {
    await dependencies(
      context,
      {
        scripts: {
          prepublishOnly: "synthetic",
          prepublish: "synthetic",
          prepack: "synthetic",
          prepare: "synthetic",
          postpack: "synthetic",
          publish: "synthetic",
          postpublish: "synthetic",
        },
      },
      {}
    );
    const result = await context.invoke();
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(
      (await context.records()).map((command) =>
        command.args[0] === "run" ? command.args[3] : command.args[0]
      ),
      [
        "--version",
        "list",
        "prepublishOnly",
        "prepublish",
        "pack",
        "publish",
        "publish",
        "postpublish",
      ]
    );
    for (const command of (await context.records()).filter(
      (command) => command.args[0] === "run"
    ))
      assert.deepEqual(command.args.slice(0, 3), [
        "run",
        "--if-present",
        "--config.enable-pre-post-scripts=false",
      ]);
    await context.clear();
    assert.equal(
      (
        await context.invoke({
          extraEnv: { PUBLISH_TEST_HOOK_FAIL: "prepublish" },
        })
      ).code,
      1
    );
    assert(
      !(await context.records()).some(
        (command) => command.args[0] === "publish" || command.args[0] === "pack"
      )
    );
  });
});

test("cancellation during a runtime dependency lookup fails before upload and cleans scratch files", async () => {
  await fixture(async (context) => {
    await dependencies(
      context,
      { dependencies: { "@fixture/control": "workspace:*" } },
      { dependencies: { "@fixture/control": "3.0.0" } }
    );
    for (const signal of ["SIGINT", "SIGTERM"]) {
      await context.clear();
      assert.equal(
        (
          await context.invoke({
            extraEnv: {
              PUBLISH_TEST_INTERRUPT: "view",
              PUBLISH_TEST_SIGNAL: signal,
            },
          })
        ).code,
        1
      );
      assert(
        !(await context.records()).some(
          (command) => command.args[0] === "publish"
        )
      );
    }
  });
});
