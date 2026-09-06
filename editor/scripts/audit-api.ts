#!/usr/bin/env tsx
/** GRIDA-SEC-012 — source-only API inventory, binding, and dependency audit. */
import { readFile, readdir, realpath, lstat } from "node:fs/promises";
import { createRequire, isBuiltin } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

export namespace apiAudit {
  export type Definition = Readonly<{
    path: string;
    methods: readonly string[];
    authority: string;
    binding: string;
    cache?: string;
  }>;
  export type Diagnostic = Readonly<{
    code: string;
    file: string;
    line: number;
    message: string;
  }>;

  const METHODS = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"];
  const EXTENSIONS = /\.(?:[cm]?[jt]sx?|mdx)$/;
  const TEST_FILE = /(?:\.(?:test|spec)\.[cm]?[jt]sx?$|\.d\.ts$)/;
  const LEGACY = {
    "gg.chat": ["/api/v1/ai/chat/completions", "POST", "gg"],
    "gg.models": ["/api/v1/ai/models", "GET", "gg"],
    "gg.images": ["/api/v1/ai/images/generations", "POST", "gg"],
    "gg.videos": ["/api/v1/ai/videos/generations", "POST", "gg"],
    "gg.music": ["/api/v1/ai/music/generations", "POST", "gg"],
    "models.catalog": ["/api/v1/models/catalog", "GET", "public"],
  } as const;
  const ENV_OWNERS = new Set(["lib/api/policy.ts", "lib/auth/oauth-server.ts"]);
  const slash = (value: string) => value.split(path.sep).join("/");
  const inside = (root: string, file: string) => {
    const relative = path.relative(root, file);
    return !relative.startsWith("..") && !path.isAbsolute(relative);
  };

  async function files(root: string): Promise<string[]> {
    let entries;
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const found: string[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = path.join(root, entry.name);
      if (entry.isSymbolicLink()) {
        // Route/source symlinks make an inventory depend on an untracked tree.
        found.push(full);
      } else if (entry.isDirectory()) found.push(...(await files(full)));
      else if (entry.isFile() && EXTENSIONS.test(entry.name)) found.push(full);
    }
    return found.sort();
  }

  function source(file: string, text: string): ts.SourceFile {
    return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  }

  /** Resolve App Router groups, parallel slots, and interception segments. */
  function appPath(relative: string): string | null {
    const segments: string[] = [];
    for (let part of relative.split("/").slice(0, -1)) {
      if (part.startsWith("_")) return null;
      if (part.startsWith("@")) continue;
      if (part.startsWith("(...)")) {
        segments.length = 0;
        part = part.slice(5);
      } else {
        while (part.startsWith("(..)")) {
          segments.pop();
          part = part.slice(4);
        }
        if (part.startsWith("(.)")) part = part.slice(3);
      }
      if (/^\([^)]*\)$/.test(part)) continue;
      try {
        segments.push(decodeURIComponent(part));
      } catch {
        segments.push(part);
      }
    }
    return `/${segments.join("/")}`;
  }

  function pagesPath(relative: string): string | null {
    const parts = relative.replace(EXTENSIONS, "").split("/");
    if (parts.some((part) => part.startsWith("_"))) return null;
    if (parts.at(-1) === "index") parts.pop();
    return `/${parts.join("/")}`;
  }

  // A dynamic parent/catch-all can also claim /api/v1, even when its literal
  // directory name does not contain that prefix. Such routes need review.
  function reachesApi(
    route: string,
    registeredPaths: readonly string[]
  ): boolean {
    const parts = route.split("/").filter(Boolean);
    for (const [index, expected] of ["api", "v1"].entries()) {
      const actual = parts[index];
      if (!actual) return false;
      if (/^\[\[?\.\.\./.test(actual)) break;
      if (actual !== expected && !/^\[[^\]]+\]$/.test(actual)) return false;
    }
    if (parts[0] === "api" && parts[1] === "v1") return true;
    // Existing workbench /[org]/[proj]/... pages are not API definitions.
    // Unknown /api/v1 URLs are closed by policy before Next routing; only
    // dynamic patterns overlapping an allowed operation can shadow a handler.
    return registeredPaths.some((registered) => {
      const literal = registered.split("/").filter(Boolean);
      for (const [index, segment] of parts.entries()) {
        if (segment.startsWith("[[...")) return index <= literal.length;
        if (segment.startsWith("[...")) return index < literal.length;
        if (literal[index] === undefined) return false;
        if (segment !== literal[index] && !/^\[[^\]]+\]$/.test(segment))
          return false;
      }
      return parts.length === literal.length;
    });
  }

  function canonicalBinding(ast: ts.SourceFile, id: string): boolean {
    // Compare AST structure to a complete template. Comments/formatting
    // remain free; extra logic, aliases, swapped methods, and extra imports do
    // not. In particular, a matching bind() call somewhere in a file is not
    // sufficient evidence that its exported handlers use that boundary.
    const expected = source(
      "route.ts",
      `import { accountApi } from "@/lib/api/account";
       export const runtime = "nodejs";
       export const dynamic = "force-dynamic";
       const handlers = accountApi.bind(${JSON.stringify(id)});
       ${METHODS.map((method) => `export const ${method} = handlers.${method};`).join("\n")}`
    );
    function shape(node: ts.Node): unknown {
      if (ts.isStringLiteral(node)) return [node.kind, node.text];
      if (ts.isIdentifier(node)) return [node.kind, node.text];
      const children: unknown[] = [];
      node.forEachChild((child) => {
        children.push(shape(child));
      });
      return [
        node.kind,
        ts.isVariableDeclarationList(node)
          ? node.flags & (ts.NodeFlags.Const | ts.NodeFlags.Let)
          : null,
        ts.isImportClause(node) ? node.isTypeOnly : null,
        children,
      ];
    }
    return JSON.stringify(shape(ast)) === JSON.stringify(shape(expected));
  }

  function exportedMethods(ast: ts.SourceFile): string[] {
    const names = new Set<string>();
    for (const statement of ast.statements) {
      if (
        ts.isExportDeclaration(statement) &&
        statement.exportClause &&
        ts.isNamedExports(statement.exportClause)
      ) {
        for (const element of statement.exportClause.elements)
          names.add(element.name.text);
      }
      if (
        !ts.canHaveModifiers(statement) ||
        !ts
          .getModifiers(statement)
          ?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      )
        continue;
      if (ts.isFunctionDeclaration(statement) && statement.name)
        names.add(statement.name.text);
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name))
            names.add(declaration.name.text);
        }
      }
    }
    return METHODS.filter((method) => names.has(method)).sort();
  }

  function forbiddenPackage(specifier: string): boolean {
    return /^(?:next|react|react-dom|next-auth|cookies?|next-cookies|react-cookie|@supabase\/ssr|@app\/ui)(?:\/|$)/.test(
      specifier
    );
  }

  function forbiddenSource(relative: string): boolean {
    return (
      /^(?:app|pages|src\/(?:app|pages)|components|scaffolds|kits|theme|www|host|grida-canvas[^/]*)(?:\/|$)/.test(
        relative
      ) ||
      /^lib\/(?:desktop|supabase\/(?:server|proxy))(?:\/|\.|$)/.test(relative)
    );
  }

  /** Inspect conditional package exports without executing a package loader. */
  async function packageTargets(
    specifier: string,
    from: string
  ): Promise<string[]> {
    const name = /^(?:@[^/]+\/[^/]+|[^@./][^/]*)/.exec(specifier)?.[0];
    if (!name) return [];
    const subpath = `.${specifier.slice(name.length)}`;
    for (const directory of createRequire(from).resolve.paths(specifier) ??
      []) {
      const packageRoot = path.join(directory, name);
      const manifestPath = path.join(packageRoot, "package.json");
      if (!ts.sys.fileExists(manifestPath)) continue;
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
        exports?: unknown;
        main?: unknown;
        module?: unknown;
      };
      const targets: string[] = [];
      function collect(value: unknown, wildcard?: string): void {
        if (typeof value === "string" && value.startsWith("./")) {
          const target = path.resolve(
            packageRoot,
            wildcard === undefined ? value : value.replaceAll("*", wildcard)
          );
          if (inside(packageRoot, target) && ts.sys.fileExists(target))
            targets.push(target);
        } else if (Array.isArray(value))
          value.forEach((entry) => collect(entry, wildcard));
        else if (value && typeof value === "object") {
          // Audit all runtime conditions, including ESM and CJS. A harmless
          // declarations/require branch cannot conceal a Next-only import branch.
          for (const [condition, entry] of Object.entries(value)) {
            if (condition !== "types" && !condition.startsWith("types@"))
              collect(entry, wildcard);
          }
        }
      }
      const exports = manifest.exports;
      if (
        exports &&
        typeof exports === "object" &&
        !Array.isArray(exports) &&
        Object.keys(exports).some((key) => key.startsWith("."))
      ) {
        const entries = exports as Record<string, unknown>;
        if (Object.hasOwn(entries, subpath)) collect(entries[subpath]);
        else
          for (const [pattern, entry] of Object.entries(entries)) {
            const star = pattern.indexOf("*");
            if (star < 0) continue;
            const prefix = pattern.slice(0, star);
            const suffix = pattern.slice(star + 1);
            if (subpath.startsWith(prefix) && subpath.endsWith(suffix)) {
              collect(
                entry,
                subpath.slice(
                  prefix.length,
                  suffix.length ? -suffix.length : undefined
                )
              );
            }
          }
      } else if (subpath === ".") collect(exports);
      if (!exports && subpath === ".") {
        for (const field of [manifest.main, manifest.module]) {
          if (typeof field === "string")
            collect(field.startsWith("./") ? field : `./${field}`);
        }
      }
      return targets;
    }
    return [];
  }

  /** No imports are executed and no environment files are loaded. */
  export async function check(options: {
    editorRoot: string;
    definitions: Readonly<Record<string, Definition>>;
  }): Promise<Diagnostic[]> {
    const root = await realpath(path.resolve(options.editorRoot));
    const diagnostics: Diagnostic[] = [];
    const report = (
      code: string,
      file: string,
      message: string,
      node?: ts.Node
    ) => {
      diagnostics.push({
        code,
        file: slash(path.relative(root, file)),
        line: node
          ? node.getSourceFile().getLineAndCharacterOfPosition(node.getStart())
              .line + 1
          : 1,
        message,
      });
    };
    const registryFile = path.join(root, "lib/api/operations.ts");
    const byPath = new Map<string, { id: string; definition: Definition }>();
    for (const [id, definition] of Object.entries(options.definitions)) {
      if (
        !/^\/api\/v1\/[A-Za-z0-9/_-]+$/.test(definition.path) ||
        definition.path.endsWith("/")
      ) {
        report(
          "registry",
          registryFile,
          `${id}: operation paths must be literal canonical /api/v1 paths.`
        );
      }
      if (byPath.has(definition.path))
        report(
          "duplicate-registration",
          registryFile,
          `${id}: duplicate registered path ${definition.path}.`
        );
      byPath.set(definition.path, { id, definition });
      if (
        !definition.methods.length ||
        new Set(definition.methods).size !== definition.methods.length ||
        definition.methods.some((method) => !METHODS.includes(method))
      ) {
        report("registry", registryFile, `${id}: invalid methods.`);
      }
      if (
        (id === "auth.me" || definition.path === "/api/v1/auth/me") &&
        (id !== "auth.me" ||
          definition.path !== "/api/v1/auth/me" ||
          definition.methods.join(",") !== "GET,HEAD,OPTIONS" ||
          definition.binding !== "account" ||
          definition.authority !== "native-account" ||
          definition.cache !== "no-store")
      ) {
        report(
          "registry",
          registryFile,
          "auth.me must retain its exact identity, methods, and account binding."
        );
      }
      if (definition.binding === "legacy") {
        const legacy = LEGACY[id as keyof typeof LEGACY];
        if (
          !legacy ||
          legacy[0] !== definition.path ||
          legacy[2] !== definition.authority ||
          definition.methods.join(",") !== legacy[1]
        ) {
          report(
            "legacy-exception",
            registryFile,
            `${id}: legacy exceptions are fixed to six existing operations.`
          );
        }
      } else if (
        definition.binding !== "account" ||
        definition.authority !== "native-account" ||
        definition.cache !== "no-store"
      ) {
        report(
          "registry",
          registryFile,
          `${id}: unsupported authority/binding/cache combination.`
        );
      }
    }
    const inventory = new Map<string, string[]>();
    for (const kind of ["app", "src/app", "pages", "src/pages"] as const) {
      const directory = path.join(root, kind);
      for (const file of await files(directory)) {
        if ((await lstat(file)).isSymbolicLink()) {
          report(
            "source-symlink",
            file,
            "Route inventories must not hide source behind symlinked files or directories."
          );
          continue;
        }
        const relative = slash(path.relative(directory, file));
        if (TEST_FILE.test(file)) continue;
        const app = kind.endsWith("app");
        if (
          app &&
          !/^(?:page|route)\.(?:[cm]?[jt]sx?|mdx)$/.test(path.basename(file))
        )
          continue;
        const route = app ? appPath(relative) : pagesPath(relative);
        if (!route || !reachesApi(route, [...byPath.keys()])) continue;
        const entries = inventory.get(route) ?? [];
        entries.push(file);
        inventory.set(route, entries);
        const registration = byPath.get(route);
        if (!registration)
          report(
            "unregistered-route",
            file,
            `${route} can serve the API namespace but is not registered.`
          );
        if (!app || !path.basename(file).startsWith("route.")) {
          report(
            "route-placement",
            file,
            `${route} must be an App Router route handler, not a page or Pages Router API.`
          );
          continue;
        }
        if (!registration) continue;
        const { id, definition } = registration;
        const ast = source(file, await readFile(file, "utf8"));
        if (definition.binding === "legacy") {
          const expected = `app/(api)/(public)${definition.path}/route.ts`;
          if (slash(path.relative(root, file)) !== expected)
            report(
              "legacy-placement",
              file,
              `${id}: the legacy exception belongs only to ${expected}.`
            );
          if (
            exportedMethods(ast).join(",") !==
            [...definition.methods].sort().join(",")
          ) {
            report(
              "legacy-methods",
              file,
              `${id}: exported methods differ from its fixed registry entry.`
            );
          }
        } else if (!canonicalBinding(ast, id)) {
          report(
            "route-binding",
            file,
            `${id}: use only the canonical accountApi.bind route template with all seven method exports.`
          );
        }
      }
    }
    for (const [route, entries] of inventory) {
      if (entries.length > 1) {
        for (const file of entries)
          report(
            "duplicate-route",
            file,
            `Multiple files resolve to ${route}.`
          );
      }
    }
    for (const [route, { id }] of byPath) {
      if (!inventory.has(route))
        report(
          "missing-route",
          registryFile,
          `${id}: no route handler exists for ${route}.`
        );
    }

    const configPath = path.join(root, "tsconfig.json");
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    const compilerOptions: ts.CompilerOptions = config.error
      ? {
          baseUrl: root,
          paths: { "@/*": ["./*"] },
          allowJs: true,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
        }
      : ts.parseJsonConfigFileContent(config.config, ts.sys, root).options;
    const seen = new Set<string>();
    const graphRoots = (
      await Promise.all(
        ["lib/api", "lib/account", "lib/gg"].map((dir) =>
          files(path.join(root, dir))
        )
      )
    )
      .flat()
      .filter(
        (file) =>
          !TEST_FILE.test(file) &&
          !file.includes(`${path.sep}__tests__${path.sep}`)
      );

    async function visit(file: string): Promise<void> {
      const resolved = await realpath(file);
      if (seen.has(resolved)) return;
      seen.add(resolved);
      const relative = slash(path.relative(root, resolved));
      for (const match of slash(resolved).matchAll(
        /\/node_modules\/((?:@[^/]+\/)?[^/]+)(?=\/|$)/g
      )) {
        if (forbiddenPackage(match[1]!)) {
          report(
            "forbidden-import",
            file,
            `API owners cannot depend on package ${match[1]}.`
          );
          return;
        }
      }
      if (inside(root, resolved) && forbiddenSource(relative)) {
        report(
          "forbidden-source",
          file,
          `API owners cannot depend on ${relative}.`
        );
        return;
      }
      const text = await readFile(resolved, "utf8");
      const ast = source(resolved, text);
      const dependencies: Array<{ specifier: string; node: ts.Node }> = [];
      const local =
        inside(root, resolved) && !relative.includes("node_modules/");
      let foundUi = false;
      function walk(node: ts.Node): void {
        if (
          !foundUi &&
          (ts.isJsxElement(node) ||
            ts.isJsxSelfClosingElement(node) ||
            ts.isJsxFragment(node) ||
            (ts.isExpressionStatement(node) &&
              ts.isStringLiteral(node.expression) &&
              node.expression.text === "use client"))
        ) {
          foundUi = true;
          report(
            "forbidden-ui",
            resolved,
            "API owners cannot contain JSX or client-component directives.",
            node
          );
        }
        if (
          (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier &&
          ts.isStringLiteral(node.moduleSpecifier)
        ) {
          dependencies.push({ specifier: node.moduleSpecifier.text, node });
        } else if (
          ts.isImportEqualsDeclaration(node) &&
          ts.isExternalModuleReference(node.moduleReference) &&
          node.moduleReference.expression &&
          ts.isStringLiteral(node.moduleReference.expression)
        ) {
          dependencies.push({
            specifier: node.moduleReference.expression.text,
            node,
          });
        } else if (
          ts.isImportTypeNode(node) &&
          ts.isLiteralTypeNode(node.argument) &&
          ts.isStringLiteral(node.argument.literal)
        ) {
          dependencies.push({ specifier: node.argument.literal.text, node });
        } else if (
          ts.isCallExpression(node) &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(node.expression) &&
              node.expression.text === "require"))
        ) {
          const argument = node.arguments[0];
          if (
            argument &&
            ts.isStringLiteralLike(argument) &&
            node.arguments.length === 1
          )
            dependencies.push({ specifier: argument.text, node });
          else
            report(
              "computed-import",
              resolved,
              "API dependencies must use statically resolved imports.",
              node
            );
        }
        if (local && !ENV_OWNERS.has(relative)) {
          if (
            (ts.isPropertyAccessExpression(node) &&
              node.name.text === "env" &&
              ts.isIdentifier(node.expression) &&
              node.expression.text === "process") ||
            (ts.isElementAccessExpression(node) &&
              ts.isIdentifier(node.expression) &&
              node.expression.text === "process" &&
              ts.isStringLiteralLike(node.argumentExpression) &&
              node.argumentExpression.text === "env") ||
            (ts.isVariableDeclaration(node) &&
              node.initializer &&
              ts.isIdentifier(node.initializer) &&
              node.initializer.text === "process")
          ) {
            report(
              "environment-owner",
              resolved,
              "Environment reads belong to api/policy or the existing OAuth configuration owner.",
              node
            );
          }
        }
        ts.forEachChild(node, walk);
      }
      walk(ast);
      for (const { specifier, node } of dependencies) {
        if (forbiddenPackage(specifier)) {
          report(
            "forbidden-import",
            resolved,
            `API owners cannot depend on ${specifier}.`,
            node
          );
          continue;
        }
        if (local && ["node:module", "module"].includes(specifier)) {
          report(
            "computed-import",
            resolved,
            "Custom module loaders bypass the API source dependency graph.",
            node
          );
          continue;
        }
        if (
          local &&
          !ENV_OWNERS.has(relative) &&
          ["process", "node:process"].includes(specifier)
        ) {
          report(
            "environment-owner",
            resolved,
            "Process environment access belongs to the configuration owners.",
            node
          );
        }
        if (isBuiltin(specifier) || specifier === "server-only") continue;
        let dependency = ts.resolveModuleName(
          specifier,
          resolved,
          compilerOptions,
          ts.sys
        ).resolvedModule?.resolvedFileName;
        // TypeScript may choose a declaration file. Inspect the real package
        // entry as well, so a framework import hidden behind a package barrel
        // cannot disappear merely because it also ships harmless .d.ts files.
        let runtime: string | undefined;
        try {
          runtime = createRequire(resolved).resolve(specifier);
        } catch {
          /* aliases resolve through TS below */
        }
        if (!dependency) dependency = runtime;
        if (!dependency) {
          report(
            "unresolved-import",
            resolved,
            `Cannot audit unresolved dependency ${specifier}.`,
            node
          );
          continue;
        }
        const packageEntries = await packageTargets(specifier, resolved);
        for (const target of new Set(
          [dependency, runtime, ...packageEntries].filter(
            (value): value is string => !!value
          )
        )) {
          if (EXTENSIONS.test(target)) await visit(target);
        }
      }
    }
    for (const file of graphRoots) {
      if ((await lstat(file)).isSymbolicLink()) {
        report(
          "source-symlink",
          file,
          "API owner inventories must not hide source behind symlinked files or directories."
        );
      } else await visit(file);
    }
    return diagnostics.sort(
      (a, b) =>
        a.file.localeCompare(b.file) ||
        a.line - b.line ||
        a.code.localeCompare(b.code) ||
        a.message.localeCompare(b.message)
    );
  }
}

async function main(): Promise<void> {
  const editorRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
  );
  const { apiOperations } = await import("../lib/api/operations");
  const diagnostics = await apiAudit.check({
    editorRoot,
    definitions: apiOperations.definitions,
  });
  for (const diagnostic of diagnostics) {
    console.error(
      `${diagnostic.file}:${diagnostic.line} [${diagnostic.code}] ${diagnostic.message}`
    );
  }
  if (diagnostics.length) process.exitCode = 1;
  else
    console.log(
      "API audit passed: route inventory, bindings, and dependency boundaries."
    );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch(() => {
    // Source/config errors are safe to identify by category; do not dump
    // arbitrary file contents or environment-derived exception payloads.
    console.error("API audit failed to read or resolve its source inventory.");
    process.exitCode = 1;
  });
}
