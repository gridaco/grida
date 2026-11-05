import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const formats = [
  ["hex", "Hex"],
  ["rgb", "RGB"],
  ["rgbf", "RGBF"],
  ["rgba", "RGBA"],
  ["oklch", "OKLCH"],
];
let directory;
let installed;

before(() => {
  directory = mkdtempSync(path.join(tmpdir(), "grida-tailwind-colors-"));
  installed = path.join(directory, "node_modules/@grida/tailwindcss-colors");
  mkdirSync(installed, { recursive: true });
  // Exercise the publication allowlist, without regenerating or fetching colors.
  const [archive] = JSON.parse(
    execFileSync(
      "npm",
      [
        "pack",
        "--ignore-scripts",
        "--json",
        "--cache",
        path.join(directory, "npm-cache"),
        "--pack-destination",
        directory,
      ],
      { cwd: packageRoot, encoding: "utf8" }
    )
  );
  execFileSync("tar", [
    "-xzf",
    path.join(directory, archive.filename),
    "--strip-components=1",
    "-C",
    installed,
  ]);
});

after(() => {
  if (directory) rmSync(directory, { recursive: true, force: true });
});

for (const [name, extension, module, moduleResolution] of [
  ["bundler", "ts", ts.ModuleKind.ESNext, ts.ModuleResolutionKind.Bundler],
  [
    "bundler (preserve)",
    "ts",
    ts.ModuleKind.Preserve,
    ts.ModuleResolutionKind.Bundler,
  ],
  ["Node ESM", "mts", ts.ModuleKind.NodeNext, ts.ModuleResolutionKind.NodeNext],
  [
    "Node CommonJS",
    "cts",
    ts.ModuleKind.NodeNext,
    ts.ModuleResolutionKind.NodeNext,
  ],
  [
    "Node16 CommonJS",
    "cts",
    ts.ModuleKind.Node16,
    ts.ModuleResolutionKind.Node16,
  ],
]) {
  test(`the packed JSON palettes and reusable types work with ${name}`, () => {
    const attribute = extension === "mts" ? ' with { type: "json" }' : "";
    const imports = formats.map(
      ([format]) =>
        `import ${format} from "@grida/tailwindcss-colors/json/${format}.json"${attribute};`
    );
    const checks = formats.flatMap(([format, type]) => {
      const data = readFileSync(
        path.join(installed, `json/${format}.json`),
        "utf8"
      );
      return [
        `type ${type}Matches = Expect<Equal<typeof ${format}.slate["500"], ${type}>>;`,
        // Check the actual shipped data against the declared keys and tuples.
        `const ${format}Data: Record<ColorName, Record<ColorShade, ${type}>> = ${data};`,
      ];
    });
    const source = path.join(directory, `consumer.${extension}`);
    writeFileSync(
      source,
      [
        ...imports,
        'import type { ColorName, ColorShade, Hex, RGB, RGBF, RGBA, OKLCH } from "@grida/tailwindcss-colors/types";',
        "type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;",
        "type Expect<T extends true> = T;",
        ...checks,
        "function rejectsInvalidInput() {",
        "  // @ts-expect-error Unknown color families are rejected.",
        "  rgb.notAColor;",
        "  // @ts-expect-error Unknown shades are rejected.",
        '  rgb.slate["550"];',
        "  // @ts-expect-error RGB has exactly three channels.",
        "  const invalidRGB: RGB = [1, 2];",
        "  // @ts-expect-error RGBA has exactly four channels.",
        "  const invalidRGBA: RGBA = [1, 2, 3];",
        "}",
        `console.log(JSON.stringify([${formats.map(([format]) => `${format}.slate["500"]`).join(",")} ]));`,
      ].join("\n")
    );
    const program = ts.createProgram([source], {
      module,
      moduleResolution,
      target: ts.ScriptTarget.ES2022,
      strict: true,
      types: [],
      // Package consumers should not need arbitrary-extension or JSON flags.
      allowArbitraryExtensions: false,
      resolveJsonModule: false,
      skipLibCheck: false,
      outDir: path.join(directory, "out"),
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    assert.equal(
      diagnostics.length,
      0,
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: (file) => file,
        getCurrentDirectory: () => directory,
        getNewLine: () => "\n",
      })
    );

    if (extension === "ts") return;
    assert.equal(program.emit().emitSkipped, false);
    const output = path.join(
      directory,
      "out",
      `consumer.${extension === "mts" ? "mjs" : "cjs"}`
    );
    const actual = execFileSync(process.execPath, [output], {
      encoding: "utf8",
    });
    const expected = formats.map(([format]) => {
      const original = JSON.parse(
        readFileSync(path.join(packageRoot, `json/${format}.json`), "utf8")
      );
      return original.slate["500"];
    });
    assert.deepEqual(JSON.parse(actual), expected);
  });
}
