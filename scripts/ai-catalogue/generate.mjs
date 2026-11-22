// Public facts come from the installed released Models package. Only product choices and native adapter schemas are authored here.
// GRIDA-SEC-008 — project the offline subscription seed from the same Models release as the public facts.
import { parseModelCatalogue } from "../../packages/grida-ai/src/catalogue/public-models.mts";
import { projectChatGptSubscription, projectFacts } from "./projection.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const require = createRequire(import.meta.url);
const formatterPackage = require.resolve("oxfmt/package.json");
const formatter = path.join(
  path.dirname(formatterPackage),
  require(formatterPackage).bin.oxfmt
);
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const home = path.join(root, "packages/grida-ai");
const catalogue = path.join(home, "src/catalogue");
const modelsRequire = createRequire(path.join(home, "package.json"));
const publicModels = modelsRequire("@grida/ai-models/models.json");
const publicAgents = modelsRequire("@grida/ai-models/agents.json");
const release = modelsRequire("@grida/ai-models/package.json").version;
const pin = JSON.parse(fs.readFileSync(path.join(home, "package.json"), "utf8"))
  .dependencies["@grida/ai-models"];
if (release !== pin)
  throw Error(`Expected installed Models ${pin}, found ${release}`);
const authored = path.join(root, "data/ai");
const check = process.argv.includes("--check");
const bundle = process.argv.includes("--bundle");
let changed = false;
// Git may materialize CRLF on Windows. Compare canonical LF text; all other
// bytes still participate in drift checks, and newly generated files use LF.
const lf = (text) => text.replaceAll("\r\n", "\n");
function write(name, text) {
  writeGenerated(
    name,
    execFileSync(process.execPath, [formatter, "--stdin-filepath", name], {
      cwd: root,
      input: text,
      encoding: "utf8",
    })
  );
}
function writeGenerated(name, text) {
  text = lf(text);
  const existing = fs.existsSync(name) ? fs.readFileSync(name, "utf8") : "";
  if (lf(existing) === text) return;
  if (check) {
    console.error(`Generated catalogue differs: ${path.relative(root, name)}`);
    changed = true;
  } else {
    fs.mkdirSync(path.dirname(name), { recursive: true });
    fs.writeFileSync(name, text);
  }
}
const json = (value) => JSON.stringify(value, null, 2) + "\n";
const service = JSON.parse(
  fs.readFileSync(path.join(authored, "presets.json"), "utf8")
);
writeGenerated(
  path.join(root, "crates/grida-agent-master/data/economy-model.txt"),
  service.tiers.nano + "\n"
);
const data = {
  service,
  inputs: JSON.parse(
    fs.readFileSync(path.join(authored, "native-inputs.json"), "utf8")
  ),
  facts: projectFacts(publicModels, service),
};
const snapshot = parseModelCatalogue(release, publicModels, publicAgents);
write(path.join(catalogue, "model-catalogue.generated.json"), json(snapshot));
const subscription = projectChatGptSubscription(
  snapshot,
  JSON.parse(
    fs.readFileSync(path.join(authored, "chatgpt-subscription.json"), "utf8")
  )
);
const subscriptionProtocol = path.join(
  root,
  "packages/grida-ai-host/src/protocol/chatgpt.ts"
);
const subscriptionSource = lf(fs.readFileSync(subscriptionProtocol, "utf8"));
const subscriptionPattern =
  /\/\* generated:chatgpt-subscription:start \*\/[\s\S]*?\/\* generated:chatgpt-subscription:end \*\//g;
if ([...subscriptionSource.matchAll(subscriptionPattern)].length !== 1)
  throw Error("Missing unique ChatGPT subscription generation block");
write(
  subscriptionProtocol,
  subscriptionSource.replace(
    subscriptionPattern,
    [
      "/* generated:chatgpt-subscription:start */",
      `// Bundled selectors from agents.json and canonical text cards: @grida/ai-models@${release}.`,
      `export const CHATGPT_SUBSCRIPTION_MODEL_IDS = ${JSON.stringify(subscription.model_ids)} as const;`,
      `export const CHATGPT_SUBSCRIPTION_DEFAULT_MODEL_ID = ${JSON.stringify(subscription.default_model_id)} as const;`,
      "// Retained only for reading saved selections; these IDs grant no execution.",
      `export const CHATGPT_SUBSCRIPTION_RETIRED_MODEL_IDS = ${JSON.stringify(subscription.retired_model_ids)} as const;`,
      `export const CHATGPT_SUBSCRIPTION_MODEL_METADATA = ${JSON.stringify(subscription.metadata)} as const;`,
      `export const CHATGPT_SUBSCRIPTION_WIRE_MODEL_BY_ID = ${JSON.stringify(subscription.wire_models)} as const;`,
      "/* generated:chatgpt-subscription:end */",
    ].join("\n")
  )
);
write(
  path.join(root, "packages/grida-ai/schemas/inputs.generated.json"),
  json(data.inputs)
);
// Authoring uses snake_case. The existing TS API and schema-1 wire format keep
// their published field names; only these named text-card fields are projected.
// Model/provider dictionary keys and JSON Schema vocabulary are never renamed.
function fields(record, names) {
  for (const [authored, published] of Object.entries(names))
    if (Object.hasOwn(record, published))
      throw Error(
        "Author catalogue field as " + authored + ", not " + published
      );
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [names[key] ?? key, value])
  );
}
function textCard(card) {
  const result = fields(card, {
    image_input_mimes: "imageInputMimes",
    context_window: "contextWindow",
    output_limit: "outputLimit",
    reasoning_providers: "reasoningProviders",
  });
  if (result.cost) {
    result.cost = fields(result.cost, {
      cache_read: "cacheRead",
      cache_write: "cacheWrite",
      long_context: "longContext",
    });
    if (result.cost.longContext)
      result.cost.longContext = fields(result.cost.longContext, {
        input_tokens_above: "inputTokensAbove",
        input_multiplier: "inputMultiplier",
        output_multiplier: "outputMultiplier",
      });
  }
  return result;
}
const consumers = {
  ...data,
  facts: {
    ...data.facts,
    "text.catalog": Object.fromEntries(
      Object.entries(data.facts["text.catalog"]).map(([id, card]) => [
        id,
        textCard(card),
      ])
    ),
  },
};
for (const file of [
  "models.ts",
  "grida/catalog.ts",
  "grida/preferences.ts",
  "grida/tiers.ts",
]) {
  const name = path.join(catalogue, file);
  const source = lf(fs.readFileSync(name, "utf8"));
  const generated = source
    .replace(/^\/\/ Released Models snapshot:.*\n/, "")
    .replace(
      /\/\* generated:(facts|service):([^:]+):start \*\/[\s\S]*?\/\* generated:\1:\2:end \*\//g,
      (_, family, key) => {
        let expression = JSON.stringify(consumers[family][key], null, 2);
        if (family === "service" && key === "definitions") {
          expression =
            "{\n" +
            Object.entries(data.service.definitions)
              .map(
                ([id, definition]) =>
                  JSON.stringify(id) +
                  ": { " +
                  [
                    ...Object.entries(definition).map(
                      ([key, value]) =>
                        JSON.stringify(key) + ": " + JSON.stringify(value)
                    ),
                    "...preferences[" + JSON.stringify(id) + "]",
                  ].join(", ") +
                  " }"
              )
              .join(",\n") +
            "\n}";
        }
        return `/* generated:${family}:${key}:start */\n${/start \*\/\s*=/.test(_) ? "= " : ""}${expression} /* generated:${family}:${key}:end */`;
      }
    );
  write(
    name,
    `// Released Models snapshot: @grida/ai-models@${release}; generated by scripts/ai-catalogue/generate.mjs.\n${generated}`
  );
}
if (bundle) {
  const { models } = require(path.join(home, "dist/catalogue/index.cjs"));
  const { MediaOperations } = require(
    path.join(root, "packages/grida-ai/dist/index.cjs")
  );
  const operations = new MediaOperations();
  const values = {
    operations: [...operations.list(), ...operations.rigging.list()],
  };

  // Builds must expose the selected released facts, rather than stale dist from before generation.
  for (const [key, expected] of Object.entries(consumers.facts)) {
    const actual = key.split(".").reduce((v, k) => v[k], models);
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw Error(`Rebuild @grida/ai before bundling: ${key}`);
  }
  for (const [name, value] of Object.entries(values))
    write(path.join(root, "crates/grida-ai/data", name + ".json"), json(value));
  const responseWindows = new Map();
  for (const model of Object.values(publicModels["text.catalog"])) {
    const binding = model.providers?.openai;
    const window = model.context_window;
    if (
      model.reference_provider !== "openai" ||
      binding?.provider !== "openai" ||
      !binding.id ||
      !Number.isSafeInteger(window) ||
      window <= 0
    )
      continue;
    if (responseWindows.has(binding.id))
      throw Error(`Duplicate OpenAI context binding: ${binding.id}`);
    responseWindows.set(binding.id, window);
  }
  write(
    path.join(root, "crates/grida-agent/data/responses-context-windows.json"),
    json({
      models_release: release,
      windows: Object.fromEntries([...responseWindows].sort()),
    })
  );
  // Exact OpenAI bindings whose model and binding facts both declare PNG
  // input and tool calls. The host offers images on a Responses connection
  // for these exact ids, whatever its endpoint; any other model id,
  // including a provider-prefixed one, stays text-only.
  const responsesPng = new Set();
  for (const model of Object.values(publicModels["text.catalog"])) {
    const binding = model.providers?.openai;
    if (
      model.reference_provider !== "openai" ||
      binding?.provider !== "openai" ||
      !binding.id ||
      model.tool_call !== true ||
      !model.image_input_mimes?.includes("image/png") ||
      binding.capabilities?.image_input !== true ||
      binding.capabilities?.tools !== true
    )
      continue;
    if (responsesPng.has(binding.id))
      throw Error(`Duplicate OpenAI PNG binding: ${binding.id}`);
    responsesPng.add(binding.id);
  }
  if (responsesPng.size === 0)
    throw Error("No OpenAI Responses model takes PNG input");
  write(
    path.join(root, "crates/grida-agent/data/responses-png-models.json"),
    json({ models_release: release, models: [...responsesPng].sort() })
  );
  // Listed models whose OpenRouter binding takes PNG input and tool calls.
  // The transport is the same for each: the canonical OpenRouter route with a
  // saved key, and exact PNG bytes resolved only for an admitted request.
  const openRouterPng = Object.entries(publicModels["text.catalog"])
    .filter(([id, model]) => {
      const binding = model?.providers?.openrouter;
      return (
        service.definitions.text.members[id]?.status === "listed" &&
        model?.tool_call === true &&
        model?.image_input_mimes?.includes("image/png") &&
        binding?.provider === "openrouter" &&
        binding.id === id &&
        binding.url === `https://openrouter.ai/${id}`
      );
    })
    .map(([id]) => id)
    .sort();
  if (openRouterPng.length === 0)
    throw Error("No listed OpenRouter model takes PNG input");
  write(
    path.join(root, "crates/grida-agent/data/openrouter-png-models.json"),
    json({ models_release: release, models: openRouterPng })
  );
  write(
    path.join(root, "packages/grida-ai/schemas/operations.generated.json"),
    json(values.operations)
  );
}
if (changed) process.exitCode = 1;
