import type { Plugin } from "vite";

/**
 * GRIDA-DESKTOP-BUILD-GUARD — fail the build if a workspace package is
 * left external instead of bundled.
 *
 * Incident (desktop 0.0.3): the released `main.js` contained a bare
 * `require("@grida/desktop-bridge")` that resolved to nothing at runtime,
 * so the app crashed on launch with "Cannot find module".
 *
 * The desktop `link:`s `@grida/*` workspace packages whose `dist/` is
 * gitignored. If those aren't built (the isolated ./desktop release CI
 * never built them), Rollup can't resolve the import and silently
 * downgrades it to an external `require(...)`. This is uniquely dangerous
 * because EVERY check stays green — the symlink resolves, types exist,
 * and local dev has `dist/` built — so it only breaks in a clean
 * packaging run. `@grida/*` packages are always meant to be bundled;
 * finding one external means the bundle is broken.
 *
 * Why a PLUGIN that exits, not `onwarn`/`this.error`: Rollup does emit
 * `UNRESOLVED_IMPORT`, but forge runs the Vite build with
 * logLevel:"silent", which swallows both the warning and Rollup's own
 * errors (a throw in `onwarn` is ignored; `this.error` only surfaces as a
 * cryptic downstream "main entry point not found"). So we inspect the
 * EMITTED bundle and, on an offender, print to stderr directly and exit
 * hard. All verified against `pnpm package`.
 *
 * Wire it into every desktop Vite entry (main, preload, agent-sidecar).
 */

const WORKSPACE_SCOPE = "@grida/";

/** Workspace imports the bundle left external — i.e. unbuilt link deps. */
export function externalizedWorkspaceImports(
  imports: Iterable<string>
): string[] {
  const offenders = new Set<string>();
  for (const id of imports) {
    // Internal emitted chunks and node/npm externals never carry the
    // workspace scope, so this prefix is the whole test.
    if (id.startsWith(WORKSPACE_SCOPE)) offenders.add(id);
  }
  return [...offenders];
}

export function gridaBundleGuard(): Plugin {
  return {
    name: "grida-desktop-build-guard",
    // Production packaging only. In dev (`electron-forge start`,
    // command:"serve") packages may be mid-build under `pnpm dev:packages`,
    // and exiting on a transient unresolved import would kill the dev
    // server. Packaging (package/make/publish) is command:"build".
    apply: "build",
    generateBundle(_options, bundle) {
      const imports = new Set<string>();
      for (const file of Object.values(bundle)) {
        if (file.type !== "chunk") continue;
        for (const id of [...file.imports, ...file.dynamicImports]) {
          imports.add(id);
        }
      }
      const offenders = externalizedWorkspaceImports(imports);
      if (offenders.length === 0) return;

      const list = offenders.map((o) => `  - ${o}`).join("\n");
      console.error(
        `\nGRIDA-DESKTOP-BUILD-GUARD: refusing to ship a broken bundle.\n` +
          `These ${WORKSPACE_SCOPE}* workspace packages were left external ` +
          `instead of bundled, so the binary will crash on launch with ` +
          `"Cannot find module":\n${list}\n` +
          `Their dist/ is gitignored — build them before packaging:\n` +
          `  pnpm build:packages   # from the repo root\n` +
          `See desktop/vite.guards.ts for the full rationale.\n`
      );
      process.exit(1);
    },
  };
}
