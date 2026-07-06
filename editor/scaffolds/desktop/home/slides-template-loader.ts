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
  /** Composer seed prompt (manifest `ext["co.grida.templates"].prompt`). */
  prompt: string;
  pages: SlidesTemplatePage[];
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
    prompt: ext?.prompt ?? `Create a slide deck like the "${title}" template.`,
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
