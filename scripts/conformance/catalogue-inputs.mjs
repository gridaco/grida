// Differential JSON input vectors produced by the pinned TypeScript parser.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { repository, referenceRoot, verifyBuild } from "./baseline.mjs";
const require = createRequire(import.meta.url);
const reference = process.argv.includes("--reference");
if (reference) await verifyBuild();
const { MediaOperations } = require(
  path.join(
    reference ? referenceRoot : repository,
    "packages/grida-ai/dist/index.cjs"
  )
);
const operations = new MediaOperations();
const wires = JSON.parse(
  fs.readFileSync(
    path.join(
      repository,
      "crates/grida-ai/tests/fixtures/media-wire-vectors.json"
    ),
    "utf8"
  )
);
const vectors = [];
for (const wire of wires) {
  const selector = wire.selector;
  const rig = ["rig-check", "rigging"].includes(selector.feature);
  const owner = rig ? operations.rigging : operations;
  const selected = { ...selector };
  if (rig) delete selected.kind;
  const cases = [
    ["valid", wire.input],
    ["null", null],
    ["array", []],
    ["unknown", { ...wire.input, undeclared: true }],
  ];
  for (const name of Object.keys(wire.input)) {
    cases.push([`${name}.null`, { ...wire.input, [name]: null }]);
    const removed = { ...wire.input };
    delete removed[name];
    cases.push([`${name}.absent`, removed]);
    const value = wire.input[name];
    if (typeof value === "number") {
      for (const n of [-1, 0, 1.5, 9007199254740992])
        cases.push([`${name}.${n}`, { ...wire.input, [name]: n }]);
    }
    if (typeof value === "string") {
      for (const text of [
        "",
        "\uFEFF \n",
        "\u0085",
        "😀",
        ".",
        "..",
        "https://user:secret@example.com/file",
        "https://example.com/file#fragment",
      ])
        cases.push([
          `${name}.${JSON.stringify(text)}`,
          { ...wire.input, [name]: text },
        ]);
    }
  }
  if (selector.kind === "image")
    cases.push(["image.count-cap", { ...wire.input, n: 17 }]);
  if (selector.feature === "model-generation") {
    cases.push([
      "tripo.texture-conflict",
      { ...wire.input, texture: false, pbr: true },
    ]);
    cases.push([
      "tripo.texture-quality-conflict",
      { ...wire.input, texture: false, texture_quality: "standard" },
    ]);
    cases.push([
      "tripo.geometry-cap",
      { ...wire.input, geometry_quality: "standard", face_limit: 1000001 },
    ]);
    if (selector.variant === "multiview")
      cases.push([
        "tripo.front-only",
        { ...wire.input, images: { front: wire.input.images.front } },
      ]);
  }
  for (const [case_id, input] of cases) {
    let expected;
    try {
      const parsed = owner.parseInput(selected, input);
      // JSON interchange keeps binary fields encoded, while native parsers return owned bytes.
      const normalized = JSON.parse(
        JSON.stringify(parsed.input, (_, v) =>
          v instanceof Uint8Array ? Buffer.from(v).toString("base64") : v
        )
      );
      if (selector.kind === "text-to-speech")
        normalized.voice_id = parsed.selection.voice_id;
      expected = { ok: true, input: normalized };
    } catch (error) {
      expected = { ok: false, code: error.code };
    }
    vectors.push({ id: `${wire.id}:${case_id}`, selector, input, expected });
  }
}
const target = path.join(
  repository,
  "crates/grida-ai/tests/fixtures/input-vectors.jsonl"
);
const bytes = vectors.map((v) => JSON.stringify(v)).join("\n") + "\n";
if (process.argv.includes("--check")) {
  if (fs.readFileSync(target, "utf8") !== bytes)
    throw Error("Input fixture drift");
} else fs.writeFileSync(target, bytes);
console.log(`Verified ${vectors.length} input contracts`);
