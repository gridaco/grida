/**
 * Build the Grida component registry.
 *
 * Reads `editor/registry/**\/*.tsx` and emits two artifacts, both committed
 * to git:
 *
 *   editor/registry/__index__.ts   — typed map of { name, component, source }
 *                                    used by <RegistryExample> for live
 *                                    Preview / Code tabs on the marketing
 *                                    and docs surfaces.
 *
 *   editor/public/r/<name>.json    — shadcn-CLI install blocks for entries
 *   editor/public/r/registry.json    under `registry/ui/`. Served at
 *                                    https://grida.co/r/<name>.json so
 *                                    consumers run
 *                                      npx shadcn@latest add <url>
 *
 * Source `.tsx` files are committed. The two outputs above are also
 * committed (mirrors shadcn-ui's pattern) so PRs show a reviewable diff
 * when an example changes and so Vercel/CI don't depend on a custom
 * prebuild firing reliably. The build is hooked via `pnpm prebuild`.
 *
 * Run manually: `pnpm --filter editor build-registry`
 * Watch mode:   `pnpm --filter editor dev:registry`
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EDITOR_ROOT = path.resolve(__dirname, "..");
const REGISTRY_DIR = path.join(EDITOR_ROOT, "registry");
const INDEX_FILE = path.join(REGISTRY_DIR, "__index__.ts");
const PUBLIC_R_DIR = path.join(EDITOR_ROOT, "public", "r");

interface RegistryFile {
  /** Slash-separated key, e.g. "examples/tree-view/quick-start". */
  name: string;
  /** Path relative to `registry/` with no extension. */
  importPath: string;
  /** Raw `.tsx` source. */
  source: string;
  /** `true` if under `registry/ui/`. */
  isUiBlock: boolean;
}

function walkTsx(dir: string, prefix = ""): RegistryFile[] {
  const out: RegistryFile[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith("__") || entry.name.startsWith(".")) continue;
    const abs = path.join(dir, entry.name);
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...walkTsx(abs, rel));
    } else if (entry.isFile() && entry.name.endsWith(".tsx")) {
      const importPath = rel.replace(/\.tsx$/, "");
      out.push({
        name: importPath,
        importPath,
        source: fs.readFileSync(abs, "utf-8"),
        isUiBlock: importPath.startsWith("ui/"),
      });
    }
  }
  return out;
}

/**
 * Pull the first JSDoc block that immediately precedes `export function`
 * or `export default` and return it as a single-line description. Used as
 * the `description` field on the shadcn block JSON so the registry index
 * shows something useful next to the title.
 */
function extractDescription(source: string): string | undefined {
  // `(?:(?!\*\/)[\s\S])*` keeps the docblock body from absorbing the
  // closing `*/` of an earlier comment — without it, the non-greedy
  // span backtracks across nested JSDoc and matches the wrong block.
  const re =
    /\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*export\s+(?:default\s+)?(?:function|const|class)/;
  const m = re.exec(source);
  if (!m) return undefined;
  const body = m[1]!;
  // Take the first non-empty content line; strip leading ` * ` and trim.
  for (const raw of body.split("\n")) {
    const line = raw.replace(/^\s*\*\s?/, "").trim();
    if (!line) continue;
    if (line.startsWith("@")) return undefined;
    return line.replace(/\s+/g, " ");
  }
  return undefined;
}

/**
 * Parse `import` lines to derive npm + shadcn-registry dependencies.
 *
 * - Bare specifiers (e.g. `lucide-react`, `@grida/tree-view`) → `dependencies`.
 * - `@/components/ui/<name>` → `registryDependencies` (existing shadcn block).
 * - `@/lib/utils`, `@/...`, `.`, `..` → ignored (already provided by any
 *   shadcn-configured app via `components.json` aliases).
 */
function extractDeps(source: string): {
  dependencies: string[];
  registryDependencies: string[];
} {
  const deps = new Set<string>();
  const regDeps = new Set<string>();
  const re = /from\s+["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const spec = m[1];
    if (!spec) continue;
    if (spec.startsWith("@/components/ui/")) {
      regDeps.add(spec.slice("@/components/ui/".length).split("/")[0]!);
      continue;
    }
    if (spec.startsWith("@/") || spec.startsWith(".")) continue;
    if (spec === "react" || spec.startsWith("react/")) continue;
    // Scoped package: keep the first two segments. Otherwise the first.
    const pkg = spec.startsWith("@")
      ? spec.split("/").slice(0, 2).join("/")
      : spec.split("/")[0]!;
    deps.add(pkg);
  }
  return {
    dependencies: [...deps].sort(),
    registryDependencies: [...regDeps].sort(),
  };
}

function emitIndex(files: RegistryFile[]): string {
  const lines: string[] = [
    "// AUTO-GENERATED by scripts/build-registry.ts — do not edit.",
    "// Run `pnpm --filter editor build-registry` to regenerate.",
    "",
    'import { lazy, type ComponentType, type LazyExoticComponent } from "react";',
    "",
    "export interface RegistryEntry {",
    "  name: string;",
    "  component: LazyExoticComponent<ComponentType>;",
    "  source: string;",
    "}",
    "",
    "export const registry: Record<string, RegistryEntry> = {",
  ];
  for (const f of files) {
    // Live `component` only makes sense for examples. UI blocks are meant
    // to be copied into consumer apps; their import paths (`@/lib/utils`)
    // don't resolve in this monorepo, so we skip the lazy import for them.
    if (f.isUiBlock) continue;
    lines.push(
      `  ${JSON.stringify(f.name)}: {`,
      `    name: ${JSON.stringify(f.name)},`,
      `    component: lazy(() => import(${JSON.stringify(`./${f.importPath}`)})),`,
      `    source: ${JSON.stringify(f.source)},`,
      `  },`
    );
  }
  lines.push("};", "");
  return lines.join("\n");
}

interface ShadcnFile {
  path: string;
  type: "registry:component";
  content: string;
}

interface ShadcnBlock {
  $schema: string;
  name: string;
  type: "registry:component";
  title: string;
  description?: string;
  dependencies: string[];
  registryDependencies: string[];
  files: ShadcnFile[];
}

function emitShadcnBlock(f: RegistryFile): ShadcnBlock {
  const blockName = f.name.slice("ui/".length);
  const { dependencies, registryDependencies } = extractDeps(f.source);
  const description = extractDescription(f.source);
  return {
    $schema: "https://ui.shadcn.com/schema/registry-item.json",
    name: blockName,
    type: "registry:component",
    title: blockName
      .split("-")
      .map((s) => s[0]!.toUpperCase() + s.slice(1))
      .join(" "),
    ...(description ? { description } : {}),
    dependencies,
    registryDependencies,
    files: [
      {
        path: `components/${blockName}.tsx`,
        type: "registry:component",
        content: f.source,
      },
    ],
  };
}

/**
 * Cheap shape check against the shadcn registry-item schema. We don't pull
 * a Zod schema in (shadcn doesn't ship one in a stable package); this
 * catches the failures we'd actually make: missing/empty file content,
 * deps with whitespace, blocks named differently from their file path.
 * Throws so a bad block can't ship.
 */
function validateBlock(block: ShadcnBlock): void {
  const errs: string[] = [];
  if (!block.name || !/^[a-z0-9][a-z0-9-]*$/.test(block.name)) {
    errs.push(`name "${block.name}" must be kebab-case`);
  }
  for (const file of block.files) {
    if (!file.content || file.content.trim().length === 0) {
      errs.push(`file ${file.path} is empty`);
    }
    if (!file.path.endsWith(".tsx")) {
      errs.push(`file ${file.path} is not a .tsx`);
    }
  }
  for (const dep of [...block.dependencies, ...block.registryDependencies]) {
    if (dep !== dep.trim() || dep.length === 0) {
      errs.push(`dependency "${dep}" has whitespace or is empty`);
    }
  }
  if (errs.length) {
    throw new Error(
      `[build-registry] invalid block "${block.name}":\n  - ${errs.join("\n  - ")}`
    );
  }
}

function emitShadcnIndex(blocks: ShadcnBlock[]) {
  return {
    $schema: "https://ui.shadcn.com/schema/registry.json",
    name: "grida",
    homepage: "https://grida.co",
    items: blocks.map((b) => ({
      name: b.name,
      type: b.type,
      title: b.title,
      files: b.files.map((file) => ({ path: file.path, type: file.type })),
    })),
  };
}

function main() {
  if (!fs.existsSync(REGISTRY_DIR)) {
    console.error(`registry dir not found: ${REGISTRY_DIR}`);
    process.exit(1);
  }
  const files = walkTsx(REGISTRY_DIR);

  fs.writeFileSync(INDEX_FILE, emitIndex(files));

  fs.mkdirSync(PUBLIC_R_DIR, { recursive: true });
  // Clear stale block JSONs so a renamed/deleted example doesn't linger.
  for (const name of fs.readdirSync(PUBLIC_R_DIR)) {
    if (name.endsWith(".json")) fs.unlinkSync(path.join(PUBLIC_R_DIR, name));
  }
  const uiBlocks = files.filter((f) => f.isUiBlock).map(emitShadcnBlock);
  for (const block of uiBlocks) {
    validateBlock(block);
    fs.writeFileSync(
      path.join(PUBLIC_R_DIR, `${block.name}.json`),
      JSON.stringify(block, null, 2) + "\n"
    );
  }
  fs.writeFileSync(
    path.join(PUBLIC_R_DIR, "registry.json"),
    JSON.stringify(emitShadcnIndex(uiBlocks), null, 2) + "\n"
  );

  console.log(
    `[build-registry] wrote ${INDEX_FILE.replace(EDITOR_ROOT + "/", "")} (${files.length - uiBlocks.length} example${files.length - uiBlocks.length === 1 ? "" : "s"})`
  );
  console.log(
    `[build-registry] wrote ${uiBlocks.length} shadcn block${uiBlocks.length === 1 ? "" : "s"} to ${path.relative(EDITOR_ROOT, PUBLIC_R_DIR)}/`
  );
}

/**
 * Re-run `main` on any `.tsx` change under `registry/`. Coalesces bursts
 * with a 50ms debounce so multi-file saves (Find & Replace, formatter)
 * only trigger one build. Swallows errors so a transient parse failure
 * during typing doesn't crash the watcher.
 */
function watch() {
  console.log(
    `[build-registry] watching ${path.relative(EDITOR_ROOT, REGISTRY_DIR)}/ …`
  );
  main();
  let timer: NodeJS.Timeout | null = null;
  fs.watch(REGISTRY_DIR, { recursive: true }, (_event, filename) => {
    if (!filename || !filename.endsWith(".tsx")) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        main();
      } catch (err) {
        console.error("[build-registry] error:", err);
      }
    }, 50);
  });
}

if (process.argv.includes("--watch")) {
  watch();
} else {
  main();
}
