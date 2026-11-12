// Public facts come from the installed released Models package. Only product choices and native adapter schemas are authored here.
import { projectFacts } from "./projection.mjs";
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
  text = lf(
    execFileSync(process.execPath, [formatter, "--stdin-filepath", name], {
      cwd: root,
      input: text,
      encoding: "utf8",
    })
  );
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
const data = {
  service,
  inputs: JSON.parse(
    fs.readFileSync(path.join(authored, "native-inputs.json"), "utf8")
  ),
  facts: projectFacts(publicModels, service),
};

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
  // Pin the exact compatible model reviewed for PNG transport.
  const openRouterPng = "openai/gpt-5.6-terra";
  const model = publicModels["text.catalog"][openRouterPng];
  const binding = model?.providers?.openrouter;
  if (
    service.definitions.text.members[openRouterPng]?.status !== "listed" ||
    model?.tool_call !== true ||
    !model?.image_input_mimes?.includes("image/png") ||
    binding?.provider !== "openrouter" ||
    binding.id !== openRouterPng ||
    binding.url !== `https://openrouter.ai/${openRouterPng}`
  )
    throw Error(`Reviewed OpenRouter PNG binding changed: ${openRouterPng}`);
  write(
    path.join(root, "crates/grida-agent/data/openrouter-png-models.json"),
    json({ models_release: release, models: [openRouterPng] })
  );
  write(
    path.join(root, "packages/grida-ai/schemas/operations.generated.json"),
    json(values.operations)
  );
}
if (changed) process.exitCode = 1;
