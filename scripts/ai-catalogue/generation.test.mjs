// GRIDA-SEC-008 — generated subscription membership, default and wire-map drift refusal.
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
import { createRequire } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { projectChatGptSubscription, projectFacts } from "./projection.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const driver = "scripts/ai-catalogue/generate.mjs";
const packageRequire = createRequire(
  join(root, "packages/grida-ai/package.json")
);
const publicModels = packageRequire("@grida/ai-models/models.json");
const presets = JSON.parse(
  readFileSync(join(root, "data/ai/presets.json"), "utf8")
);
const subscriptionDefinition = JSON.parse(
  readFileSync(join(root, "data/ai/chatgpt-subscription.json"), "utf8")
);

test("public Models is the only factual source and unsupported bindings remain unavailable", () => {
  const projected = projectFacts(publicModels, presets);
  assert.equal(
    projected["image.models"]["openai/gpt-image-2"].providers.fal.id,
    publicModels["image.models"]["openai/gpt-image-2"].providers.fal.id
  );
  const seedance =
    projected["video.models"]["bytedance/seedance-2.0"].providers.openrouter;
  assert.equal(seedance.input, "text");
  assert.deepEqual(
    seedance.pricing,
    publicModels["video.models"]["bytedance/seedance-2.0"].providers.openrouter
      .pricing
  );
  assert.equal(seedance.pricing.usd_per_second, undefined);
  assert.equal(
    projected["image.models"]["openai/gpt-image-2"].providers.openrouter
      .avg_cost_usd,
    undefined
  );
  assert.equal(
    projected["embedding.models"][presets.library_embedding.model_id]
      .dimensions,
    presets.library_embedding.dimensions
  );
  const altered = structuredClone(publicModels);
  altered["image.models"]["openai/gpt-image-2"].label = "Changed public label";
  assert.equal(
    projectFacts(altered, presets)["image.models"]["openai/gpt-image-2"].label,
    "Changed public label"
  );
  delete altered["image.models"]["openai/gpt-image-2"];
  assert.throws(() => projectFacts(altered, presets), /Unknown public model/);
});

test("subscription membership is explicit, default stays offered and retired IDs grant no execution", () => {
  const projected = projectChatGptSubscription(
    publicModels,
    subscriptionDefinition
  );
  assert.deepEqual(projected.model_ids, subscriptionDefinition.model_ids);
  assert.ok(projected.model_ids.includes(projected.default_model_id));
  assert.deepEqual(Object.keys(projected.wire_models), projected.model_ids);
  for (const id of projected.model_ids)
    assert.equal(
      projected.wire_models[id],
      publicModels["text.catalog"][id].providers.openai.id
    );
  for (const id of projected.retired_model_ids)
    assert.equal(projected.wire_models[id], undefined);
  const expanded = structuredClone(publicModels);
  expanded["text.catalog"]["openai/unselected-model"] = {
    ...expanded["text.catalog"][projected.default_model_id],
    id: "openai/unselected-model",
  };
  assert.deepEqual(
    projectChatGptSubscription(expanded, subscriptionDefinition),
    projected
  );
  for (const edit of [
    (profile) => {
      profile.default_model_id = profile.retired_model_ids[0];
    },
    (profile) => {
      profile.model_ids.push(profile.model_ids[0]);
    },
    (profile) => {
      profile.retired_model_ids.push(profile.model_ids[0]);
    },
    (profile) => {
      profile.model_ids.push("openai/unreviewed-model");
    },
  ]) {
    const changed = structuredClone(subscriptionDefinition);
    edit(changed);
    assert.throws(
      () => projectChatGptSubscription(publicModels, changed),
      /subscription/i
    );
  }
  const incompatible = structuredClone(publicModels);
  incompatible["text.catalog"][
    projected.default_model_id
  ].providers.openai.capabilities.tools = false;
  assert.throws(
    () => projectChatGptSubscription(incompatible, subscriptionDefinition),
    /compatible public OpenAI binding/
  );
});

test("public release, product presets and generated native input copies cannot drift silently", (t) => {
  const fixture = mkdtempSync(join(tmpdir(), "grida-ai-generation-"));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  for (const name of [
    ".oxfmtrc.jsonc",
    "data/ai/presets.json",
    "data/ai/chatgpt-subscription.json",
    "data/ai/native-inputs.json",
    "packages/grida-ai/package.json",
    "packages/grida-ai/src/catalogue",
    "packages/grida-ai/schemas/inputs.generated.json",
    "packages/grida-ai-host/src/protocol/chatgpt.ts",
    "crates/grida-agent/data/chatgpt-subscription-models.json",
    "crates/grida-agent-master/data/economy-model.txt",
    "scripts/ai-catalogue/generate.mjs",
    "scripts/ai-catalogue/projection.mjs",
  ]) {
    const target = join(fixture, name);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(root, name), target, { recursive: true });
  }
  mkdirSync(join(fixture, "node_modules"));
  symlinkSync(
    join(root, "node_modules/oxfmt"),
    join(fixture, "node_modules/oxfmt"),
    process.platform === "win32" ? "junction" : "dir"
  );
  const installed = join(
    fixture,
    "packages/grida-ai/node_modules/@grida/ai-models"
  );
  mkdirSync(installed, { recursive: true });
  for (const name of ["package.json", "models.json"])
    cpSync(
      packageRequire.resolve(`@grida/ai-models/${name}`),
      join(installed, name)
    );
  function run(...args) {
    return spawnSync(process.execPath, [join(fixture, driver), ...args], {
      cwd: fixture,
      encoding: "utf8",
      timeout: 20_000,
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
  const projections = [
    "packages/grida-ai/schemas/inputs.generated.json",
    "packages/grida-ai-host/src/protocol/chatgpt.ts",
    "crates/grida-agent/data/chatgpt-subscription-models.json",
    "crates/grida-agent-master/data/economy-model.txt",
    ...[
      "models.ts",
      "grida/catalog.ts",
      "grida/preferences.ts",
      "grida/tiers.ts",
    ].map((name) => `packages/grida-ai/src/catalogue/${name}`),
  ].map((name) => join(fixture, name));
  const crlf = projections.map((name) => {
    const text = readFileSync(name, "utf8").replace(/\r?\n/g, "\r\n");
    writeFileSync(name, text);
    return text;
  });
  succeeds(run("--check"));
  assert.deepEqual(
    projections.map((name) => readFileSync(name, "utf8")),
    crlf
  );
  for (const [name, edit, stale] of [
    [
      "data/ai/presets.json",
      (data) => {
        data.tiers.nano = data.tiers.mini;
      },
      "economy-model.txt",
    ],
    [
      "packages/grida-ai/node_modules/@grida/ai-models/models.json",
      (data) => {
        data["text.catalog"][presets.tiers.nano].label = "Changed public label";
      },
      "models.ts",
    ],
    [
      "data/ai/presets.json",
      (data) => {
        data.preferences.text.default_id = "changed-product-default";
      },
      "preferences.ts",
    ],
    [
      "data/ai/native-inputs.json",
      (data) => {
        data.image.properties.n.maximum = 15;
      },
      "inputs.generated.json",
    ],
    [
      "data/ai/chatgpt-subscription.json",
      (data) => {
        data.default_model_id = data.model_ids[1];
      },
      "chatgpt.ts",
    ],
    [
      "packages/grida-ai/node_modules/@grida/ai-models/models.json",
      (data) => {
        data["text.catalog"][
          subscriptionDefinition.default_model_id
        ].providers.openai.id = "changed-wire-binding";
      },
      "chatgpt-subscription-models.json",
    ],
  ]) {
    update(name, edit);
    const result = run("--check");
    assert.equal(result.status, 1, result.stderr);
    assert.ok(result.stderr.includes(stale), result.stderr);
    succeeds(run());
    succeeds(run("--check"));
  }
  for (const name of [
    "packages/grida-ai-host/src/protocol/chatgpt.ts",
    "crates/grida-agent/data/chatgpt-subscription-models.json",
  ]) {
    const target = join(fixture, name);
    writeFileSync(
      target,
      readFileSync(target, "utf8").replace("gpt-6.1-sol", "stale-model")
    );
    const result = run("--check");
    assert.equal(result.status, 1, result.stderr);
    assert.ok(result.stderr.includes(name), result.stderr);
    succeeds(run());
    succeeds(run("--check"));
  }
  update(
    "packages/grida-ai/node_modules/@grida/ai-models/package.json",
    (data) => {
      data.version = "0.0.0";
    }
  );
  assert.match(run("--check").stderr, /Expected installed Models/);
});
