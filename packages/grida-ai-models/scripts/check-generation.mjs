import assert from "node:assert/strict";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const driver = "packages/grida-ai-models/scripts/generate.mjs";

test("canonical authoring and each package-local projection cannot drift silently", (t) => {
  const fixture = mkdtempSync(join(tmpdir(), "grida-ai-generation-"));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  for (const name of [
    ".oxfmtrc.jsonc",
    "data/ai",
    "packages/grida-ai-models/src",
    "packages/grida-ai/schemas/inputs.generated.json",
    driver,
  ]) {
    const target = join(fixture, name);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(root, name), target, { recursive: true });
  }
  // Only the installed package is available: no POSIX/.cmd bin shim exists.
  // The generator must invoke its declared JS bin through this Node runtime.
  mkdirSync(join(fixture, "node_modules"));
  symlinkSync(
    join(root, "node_modules/oxfmt"),
    join(fixture, "node_modules/oxfmt"),
    process.platform === "win32" ? "junction" : "dir"
  );
  function run(...args) {
    return spawnSync(process.execPath, [join(fixture, driver), ...args], {
      cwd: fixture,
      encoding: "utf8",
    });
  }
  function succeeds(result) {
    assert.equal(result.status, 0, result.stderr || result.error?.message);
  }
  function update(name, edit) {
    const target = join(fixture, name);
    const value = JSON.parse(readFileSync(target, "utf8"));
    edit(value);
    writeFileSync(target, JSON.stringify(value));
  }
  succeeds(run("--check"));
  for (const [name, edit, stale] of [
    [
      "data/ai/facts.json",
      (data) => {
        Object.values(data["text.catalog"])[0].label = "Changed factual label";
      },
      "models.ts",
    ],
    [
      "data/ai/service.json",
      (data) => {
        data.preferences.text.default_id = "changed-service-default";
      },
      "preferences.ts",
    ],
    [
      "data/ai/inputs.json",
      (data) => {
        data.image.properties.n.maximum = 15;
      },
      "inputs.generated.json",
    ],
  ]) {
    update(name, edit);
    const result = run("--check");
    assert.equal(result.status, 1, result.stderr);
    assert.ok(result.stderr.includes(stale), result.stderr);
    succeeds(run());
    succeeds(run("--check"));
  }
  update("packages/grida-ai/schemas/inputs.generated.json", (data) => {
    data.image.properties.n.maximum = 17;
  });
  const modifiedCopy = run("--check");
  assert.equal(modifiedCopy.status, 1);
  assert.match(modifiedCopy.stderr, /inputs\.generated\.json/);
  succeeds(run());
  assert.deepEqual(
    JSON.parse(
      readFileSync(
        join(fixture, "packages/grida-ai/schemas/inputs.generated.json"),
        "utf8"
      )
    ),
    JSON.parse(readFileSync(join(fixture, "data/ai/inputs.json"), "utf8"))
  );
});
