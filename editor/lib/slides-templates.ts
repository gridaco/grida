/**
 * Client loader for bundled slide templates published from
 * `public/slides-templates`.
 *
 * Templates ship as zipped dotcanvas `.canvas` bundles at
 * `/templates/slides/<name>.canvas.zip`. The zip is transport only: this
 * module unzips in memory and reads the bundle through dotcanvas's normal
 * `ReadableFs` port.
 */

import { unzipSync } from "fflate";
import { dotcanvas } from "dotcanvas";

export type SlidesTemplateFile = { path: string; text: string };

export type SlidesTemplatePage = {
  id: string;
  /** Human label (manifest entry `name`), falling back to the id. */
  name: string;
  /** Raw SVG text from the template bundle. */
  text: string;
  /** Object URL of the page SVG, page-lifetime, intentionally never revoked. */
  url: string;
};

export type SlidesTemplate = {
  /** Bundle name, e.g. `"startup-pitch.canvas"`; stable template identity. */
  name: string;
  title: string;
  system?: string;
  prompt?: string;
  activeId?: string;
  pages: SlidesTemplatePage[];
  /** The unzipped `.canvas` bundle as flat text files. */
  files: SlidesTemplateFile[];
};

type TemplatesExt = {
  "co.grida.templates"?: {
    title?: string;
    prompt?: string;
    system?: string;
    activeId?: string;
  };
};

export namespace SlidesTemplates {
  const BASE = "/templates/slides";
  const byZipName = new Map<string, Promise<SlidesTemplate>>();
  let all: Promise<SlidesTemplate[]> | null = null;

  export async function load(name: string): Promise<SlidesTemplate> {
    return loadZipName(toZipName(name));
  }

  /**
   * Load every bundled template in index order. Memoized for the page lifetime;
   * repeated calls reuse the same object URLs.
   */
  export function loadAll(): Promise<SlidesTemplate[]> {
    all ??= (async () => {
      const index: string[] = await fetch(`${BASE}/index.json`).then((r) => {
        if (!r.ok) throw new Error(`${BASE}/index.json: ${r.status}`);
        return r.json();
      });
      const loaded = await Promise.all(
        index.map((zip) =>
          loadZipName(zip).catch((err) => {
            console.error(`[slides-templates] failed to load ${zip}:`, err);
            return null;
          })
        )
      );
      return loaded.filter(
        (t): t is SlidesTemplate => t !== null && t.pages.length > 0
      );
    })().catch((err) => {
      all = null;
      throw err;
    });
    return all;
  }

  function toZipName(name: string): string {
    if (name.endsWith(".zip")) return name;
    if (name.endsWith(".canvas")) return `${name}.zip`;
    return `${name}.canvas.zip`;
  }

  function loadZipName(zipName: string): Promise<SlidesTemplate> {
    const cached = byZipName.get(zipName);
    if (cached) return cached;
    const promise = loadOne(zipName).catch((err) => {
      byZipName.delete(zipName);
      throw err;
    });
    byZipName.set(zipName, promise);
    return promise;
  }

  async function fetchBytes(url: string): Promise<Uint8Array> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  function bundleFiles(
    entries: Record<string, Uint8Array>,
    dec: TextDecoder
  ): SlidesTemplateFile[] {
    return Object.entries(entries)
      .filter(([rel]) => !rel.includes("/") && !rel.includes("\\"))
      .map(([rel, bytes]) => ({ path: rel, text: dec.decode(bytes) }));
  }

  async function loadOne(zipName: string): Promise<SlidesTemplate> {
    const entries = unzipSync(await fetchBytes(`${BASE}/${zipName}`));
    const dec = new TextDecoder();
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
      prompt: ext?.prompt,
      activeId: ext?.activeId,
      pages: canvas.documents
        .filter((d) => d.src in entries)
        .map((d) => {
          const text = dec.decode(entries[d.src]);
          return {
            id: d.id,
            name: typeof d.meta?.name === "string" ? d.meta.name : d.id,
            text,
            url: URL.createObjectURL(
              new Blob([entries[d.src].slice()], { type: "image/svg+xml" })
            ),
          };
        }),
      files: bundleFiles(entries, dec),
    };
  }
}
