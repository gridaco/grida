/**
 * Loader for the bundled slides templates — the client half of the
 * `public/slides-templates` publishing unit (see `/public/README.md`).
 *
 * Each template ships as a zipped `dotcanvas` `.canvas` bundle at
 * `/templates/slides/<name>.canvas.zip` (plus an `index.json` listing). The
 * zip is TRANSPORT ONLY: this module unzips it in memory and reads the bundle
 * through dotcanvas's normal `ReadableFs` port, so the `.canvas` directory
 * contract is consumed verbatim — dotcanvas never learns about zip.
 *
 * This file is the CODE-SPLIT BOUNDARY: it is the only client importer of
 * `fflate` + `dotcanvas`, and the gallery reaches it via a dynamic `import()`
 * so neither lands in the home's initial chunk. Plain async module, no React
 * (core-first: the React side is a thin wire).
 */

import { unzipSync } from "fflate";
import { dotcanvas } from "dotcanvas";
import type { ScratchSeedFile } from "@/lib/desktop/welcome-handoff";

/** One deck page, ready to render as `<img src={url}>`. */
export type SlidesTemplatePage = {
  id: string;
  /** Human label (manifest entry `name`), falling back to the id. */
  name: string;
  /** Object URL of the page SVG — page-lifetime, intentionally never revoked. */
  url: string;
};

/** A loaded template: the deck's manifest ext + its ordered pages. */
export type SlidesTemplate = {
  /** Bundle name, e.g. `"startup-pitch.canvas"` — stable template identity. */
  name: string;
  title: string;
  /** The deck's visual-system name (manifest `ext["co.grida.templates"].system`,
   *  e.g. `"obsidian"`, `"riso"`) — carried into the `user_template_selection`
   *  context so the model can name the style it holds. Absent if the manifest
   *  omits it. */
  system?: string;
  pages: SlidesTemplatePage[];
  /**
   * The deck's unzipped `.canvas` bundle as text files (the manifest
   * `.canvas.json` + each `NNN.svg`), flat single-segment paths. On start these
   * ride the handoff into the session's SCRATCH dir (agent-only, ephemeral) —
   * NOT the user's workspace: a picked template is reference material, like an
   * attachment (WG `scratch.md`). The agent reads them from scratch, holds the
   * template's visual system, and builds the adapted deck in the workspace.
   * Closes over the in-memory `entries` this loader already unzipped for the
   * previews — the raw bytes previously discarded.
   */
  files: ScratchSeedFile[];
};

type TemplatesExt = {
  "co.grida.templates"?: {
    title?: string;
    prompt?: string;
    system?: string;
    activeId?: string;
  };
};

const BASE = "/templates/slides";

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * The unzipped bundle as flat text files — the manifest + slide SVGs, each
 * UTF-8-decoded. Backs {@link SlidesTemplate.files}: these ride the handoff into
 * the session scratch on start (agent-only). Only single-segment entries are
 * kept — the bundle IS flat (`.canvas.json` + `NNN.svg`, no nested dirs); the
 * filter guards the daemon's single-segment `writeScratchFile` contract against
 * a malformed zip.
 */
function bundleFiles(entries: Record<string, Uint8Array>): ScratchSeedFile[] {
  const dec = new TextDecoder();
  return Object.entries(entries)
    .filter(([rel]) => !rel.includes("/") && !rel.includes("\\"))
    .map(([rel, bytes]) => ({ path: rel, text: dec.decode(bytes) }));
}

async function loadOne(zipName: string): Promise<SlidesTemplate> {
  const entries = unzipSync(await fetchBytes(`${BASE}/${zipName}`));
  const dec = new TextDecoder();
  // The unzipped map IS a `.canvas` directory — hand it to dotcanvas as-is.
  const canvas = await dotcanvas.read<TemplatesExt>({
    list: async () => Object.keys(entries),
    read: async (p) => (p in entries ? dec.decode(entries[p]) : null),
  });
  const name = zipName.replace(/\.zip$/, "");
  const ext = canvas.manifest?.ext?.["co.grida.templates"];
  const title = ext?.title ?? name.replace(/\.canvas$/, "");
  return {
    name,
    title,
    system: ext?.system,
    pages: canvas.documents
      .filter((d) => d.src in entries)
      .map((d) => ({
        id: d.id,
        name: typeof d.meta?.name === "string" ? d.meta.name : d.id,
        // `.slice()` re-buffers onto a plain ArrayBuffer (BlobPart-compatible).
        url: URL.createObjectURL(
          new Blob([entries[d.src].slice()], { type: "image/svg+xml" })
        ),
      })),
    // The unzipped bundle as text files — seeded into the session scratch on
    // start (agent-only reference), instead of discarding the bytes here.
    files: bundleFiles(entries),
  };
}

let memo: Promise<SlidesTemplate[]> | null = null;

/**
 * Load every bundled template (index order). Memoized for the page lifetime —
 * repeated calls (tab switches, re-mounts) reuse the same object URLs. A
 * template that fails to load is dropped (logged), not fatal to the set.
 */
export function loadSlidesTemplates(): Promise<SlidesTemplate[]> {
  memo ??= (async () => {
    const index: string[] = await fetch(`${BASE}/index.json`).then((r) => {
      if (!r.ok) throw new Error(`${BASE}/index.json: ${r.status}`);
      return r.json();
    });
    const loaded = await Promise.all(
      index.map((zip) =>
        loadOne(zip).catch((err) => {
          console.error(`[slides-templates] failed to load ${zip}:`, err);
          return null;
        })
      )
    );
    return loaded.filter(
      (t): t is SlidesTemplate => t !== null && t.pages.length > 0
    );
  })();
  return memo;
}
