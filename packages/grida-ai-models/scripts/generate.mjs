// data/ai is the authoring source. Runtime consumers only use local generated assets.
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
  "../../.."
);
const home = path.join(root, "packages/grida-ai-models");
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
const data = Object.fromEntries(
  ["facts", "service", "inputs"].map((name) => [
    name,
    JSON.parse(fs.readFileSync(path.join(authored, name + ".json"), "utf8")),
  ])
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
  const name = path.join(home, "src", file);
  const source = fs.readFileSync(name, "utf8");
  const generated = source.replace(
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
  write(name, generated);
}
if (bundle) {
  const { models } = require(path.join(home, "dist/index.js"));
  const { catalog } = require(path.join(home, "dist/grida.js"));
  const { MediaOperations } = require(
    path.join(root, "packages/grida-ai/dist/index.cjs")
  );
  const operations = new MediaOperations();
  const values = {
    facts: data.facts,
    service: data.service,
    inputs: data.inputs,
    snapshot: catalog.snapshot.seed({ version: "bundled" }),
    operations: [...operations.list(), ...operations.rigging.list()],
    views: Object.fromEntries(
      [
        "text",
        "image",
        "video",
        "audio.music",
        "audio.sound_effects",
        "audio.text_to_speech",
        "three_d",
        "three_d.model_generation",
        "three_d.rigging",
        "image_tools",
      ].map((p) => [
        p,
        p
          .split(".")
          .reduce((v, k) => v[k], catalog)
          .ordered_models(),
      ])
    ),
  };
  // Builds must expose the authored facts, rather than stale dist from before generation.
  for (const [key, expected] of Object.entries(consumers.facts)) {
    const actual = key.split(".").reduce((v, k) => v[k], models);
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw Error(`Rebuild models before bundling: ${key}`);
  }
  for (const [name, value] of Object.entries(values))
    write(path.join(root, "crates/grida-ai/data", name + ".json"), json(value));
  write(
    path.join(root, "packages/grida-ai/schemas/operations.generated.json"),
    json(values.operations)
  );
}
if (changed) process.exitCode = 1;
