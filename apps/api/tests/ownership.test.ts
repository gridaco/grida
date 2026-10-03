import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { isBuiltin } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, test } from "vitest";

const app = fileURLToPath(new URL("../", import.meta.url));
const repository = path.resolve(app, "../..");

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (
      ["node_modules", "dist"].includes(entry.name) ||
      entry.name.startsWith(".")
    )
      return [];
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) return sources(filename);
    return /\.[cm]?[jt]sx?$/.test(filename) &&
      !/\.(test|spec|config)\.[cm]?[jt]sx?$/.test(filename)
      ? [filename]
      : [];
  });
}

type ProducerPolicy = {
  directory: string;
  dependencies: readonly string[];
  builtins?: Readonly<Record<string, readonly string[]>>;
  translationData?: boolean;
};

const producers: ProducerPolicy[] = [
  {
    directory: "packages/grida-forms",
    dependencies: [
      "@grida/tokens",
      "date-fns",
      "date-fns-tz",
      "uuid",
      "handlebars",
      "zod",
    ],
  },
  {
    directory: "packages/workspace-utils",
    dependencies: [],
    builtins: { "src/otp.ts": ["node:crypto"] },
  },
  {
    directory: "packages/translations",
    dependencies: ["@formatjs/intl-localematcher", "i18next", "negotiator"],
    translationData: true,
  },
  {
    directory: "packages/emails",
    dependencies: ["@react-email/components", "react", "react-dom"],
  },
  {
    directory: "packages/grida-postgrest",
    dependencies: ["ajv", "fast-xml-parser", "flat"],
  },
  {
    directory: "database",
    dependencies: ["@supabase/supabase-js", "type-fest"],
    builtins: { "commerce.ts": ["assert", "node:assert"] },
  },
];

function within(root: string, filename: string): boolean {
  const relative = path.relative(root, filename);
  return (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function dependencyName(specifier: string): string {
  return specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : specifier.split("/")[0];
}

function accessName(node: ts.Node): string | undefined {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isMetaProperty(node)) return node.getText();
  if (ts.isPropertyAccessExpression(node)) {
    const parent = accessName(node.expression);
    return parent && `${parent}.${node.name.text}`;
  }
  if (
    ts.isElementAccessExpression(node) &&
    ts.isStringLiteral(node.argumentExpression)
  ) {
    const parent = accessName(node.expression);
    return parent && `${parent}.${node.argumentExpression.text}`;
  }
}

function ambientViolations(source: string, filename: string): string[] {
  const violations = new Set<string>();
  const tree = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true
  );
  const network =
    /^(?:(?:globalThis|window|self)\.)?(?:fetch|XMLHttpRequest|WebSocket|EventSource)$/;
  const visit = (node: ts.Node) => {
    const name = accessName(node);
    if (name && network.test(name)) violations.add("ambient network access");
    if (
      name &&
      /^(?:(?:globalThis|window|self)\.)?(?:process|Deno|Bun)(?:\.|$)|^import\.meta\.env(?:\.|$)/.test(
        name
      )
    ) {
      violations.add("ambient environment access");
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return [...violations];
}

function importViolations(
  filename: string,
  source: string,
  root: string,
  declared: ReadonlySet<string>,
  producer?: ProducerPolicy
): string[] {
  const violations: string[] = [];
  const imports = ts.preProcessFile(source, true, true).importedFiles;
  for (const { fileName: specifier } of imports) {
    if (specifier.startsWith(".") || path.isAbsolute(specifier)) {
      const target = path.resolve(path.dirname(filename), specifier);
      const dataRoot = path.join(repository, "data/translations");
      const catalog =
        producer?.translationData &&
        within(dataRoot, target) &&
        target.endsWith(".json");
      if (!within(root, target) && !catalog)
        violations.push(`escaping import ${specifier}`);
    } else if (isBuiltin(specifier)) {
      if (
        producer &&
        !producer.builtins?.[path.relative(root, filename)]?.includes(specifier)
      )
        violations.push(`forbidden Node import ${specifier}`);
    } else {
      const name = dependencyName(specifier);
      if (
        ["next", "editor", "server-only", "@grida/api"].includes(name) ||
        specifier.startsWith("@/")
      )
        violations.push(`application import ${specifier}`);
      if (!declared.has(name))
        violations.push(`undeclared import ${specifier}`);
      if (producer && !producer.dependencies.includes(name))
        violations.push(`unapproved producer dependency ${specifier}`);
    }
  }
  return violations;
}

test("API and shared producers enforce their dependency and execution boundaries", () => {
  const violations: string[] = [];
  for (const producer of [undefined, ...producers]) {
    const root = producer ? path.join(repository, producer.directory) : app;
    const manifest = JSON.parse(
      readFileSync(path.join(root, "package.json"), "utf8")
    );
    const dependencies = new Set(
      Object.keys({
        ...manifest.dependencies,
        ...manifest.devDependencies,
        ...manifest.peerDependencies,
      })
    );
    if (producer) {
      for (const name of Object.keys({
        ...manifest.dependencies,
        ...manifest.peerDependencies,
      })) {
        if (!producer.dependencies.includes(name))
          violations.push(
            `${producer.directory}: unapproved runtime dependency ${name}`
          );
      }
    }
    const directory =
      root === app
        ? path.join(root, "server")
        : producer?.directory === "database"
          ? root
          : path.join(root, "src");
    for (const filename of sources(directory)) {
      const source = readFileSync(filename, "utf8");
      const errors = importViolations(
        filename,
        source,
        root,
        dependencies,
        producer
      );
      if (producer) errors.push(...ambientViolations(source, filename));
      violations.push(
        ...errors.map(
          (error) => `${path.relative(repository, filename)}: ${error}`
        )
      );
    }
  }
  expect(violations).toEqual([]);
});

test("editor consumers cannot bypass the public API through source imports", () => {
  const editor = path.join(repository, "editor");
  const violations: string[] = [];
  for (const filename of sources(editor)) {
    const imports = ts.preProcessFile(
      readFileSync(filename, "utf8"),
      true,
      true
    ).importedFiles;
    for (const { fileName: specifier } of imports) {
      const target = specifier.startsWith("@/")
        ? path.resolve(editor, specifier.slice(2))
        : specifier.startsWith(".") || path.isAbsolute(specifier)
          ? path.resolve(path.dirname(filename), specifier)
          : undefined;
      if (
        dependencyName(specifier) === "@grida/api" ||
        (target && within(app, target))
      )
        violations.push(`${path.relative(repository, filename)}: ${specifier}`);
    }
  }
  expect(violations).toEqual([]);
});

test("producer guard distinguishes code from copy and rejects actual escape paths", () => {
  expect(
    ambientViolations(
      'const label = "process.env or fetch"; // fetch(url)',
      "copy.ts"
    )
  ).toEqual([]);
  expect(
    ambientViolations('const token = process["env"].TOKEN;', "bad.ts")
  ).toContain("ambient environment access");
  expect(
    ambientViolations('globalThis["fetch"]("https://example.com");', "bad.ts")
  ).toContain("ambient network access");
  const producer = producers.find(
    (item) => item.directory === "packages/translations"
  )!;
  const root = path.join(repository, producer.directory);
  const filename = path.join(root, "src/resources.ts");
  const declared = new Set(["resend"]);
  expect(
    importViolations(
      filename,
      'import data from "../../../data/translations/en/forms.json";',
      root,
      declared,
      producer
    )
  ).toEqual([]);
  expect(
    importViolations(
      filename,
      'import data from "../../../data/translations/en/forms.json";',
      root,
      declared,
      { ...producer, translationData: false }
    )
  ).toContain("escaping import ../../../data/translations/en/forms.json");
  expect(
    importViolations(
      filename,
      'import secret from "../../../editor/env";',
      root,
      declared,
      producer
    )
  ).toContain("escaping import ../../../editor/env");
  expect(
    importViolations(
      filename,
      'import { Resend } from "resend";',
      root,
      declared,
      producer
    )
  ).toContain("unapproved producer dependency resend");
  expect(
    importViolations(
      filename,
      'import fs from "node:fs";',
      root,
      declared,
      producer
    )
  ).toContain("forbidden Node import node:fs");
});

test("API route inventory reserves Forms to its product namespace without aliases", () => {
  const routes = sources(path.join(app, "server/routes"))
    .map((filename) => path.relative(path.join(app, "server/routes"), filename))
    .sort();
  expect(routes).toEqual([
    "health.get.ts",
    "v1/forms/[id].get.ts",
    "v1/forms/[id]/session.get.ts",
    "v1/forms/session/[session]/field/[field].patch.ts",
    "v1/forms/session/[session]/field/[field]/challenge/email/start.post.ts",
    "v1/forms/session/[session]/field/[field]/challenge/email/state.get.ts",
    "v1/forms/session/[session]/field/[field]/challenge/email/verify.post.ts",
    "v1/forms/session/[session]/field/[field]/file/preview/public-url.get.ts",
    "v1/forms/session/[session]/field/[field]/file/upload/signed-url.post.ts",
    "v1/forms/session/[session]/field/[field]/file/upload/signed-url.put.ts",
    "v1/forms/session/[session]/field/[field]/search/meta.get.ts",
    "v1/forms/submit/[id].get.ts",
    "v1/forms/submit/[id].post.ts",
  ]);
});

test("platform HTTP defaults and diagnostics do not import Forms policy", () => {
  const files = [
    "server/middleware/00-platform-http.ts",
    "server/error-handler.ts",
    "server/plugins/diagnostics.ts",
    "server/routes/health.get.ts",
  ];
  for (const filename of files) {
    const imports = ts.preProcessFile(
      readFileSync(path.join(app, filename), "utf8"),
      true,
      true
    ).importedFiles;
    expect(
      imports
        .filter(
          ({ fileName }) =>
            fileName === "@grida/forms" || fileName.includes("/forms/")
        )
        .map(({ fileName }) => `${filename}: ${fileName}`)
    ).toEqual([]);
  }
});
