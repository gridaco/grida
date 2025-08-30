/**
 * Core FontFace utilities for both Node.js and browser environments
 * Unified font manager that works for both DOM and WASM backends
 */

import type { GoogleWebFontListItem } from "./google";

// ---------- Core Types ----------

export type FontVariant = {
  family: string; // canonical family id
  weight?: string | number; // 100..900 or "400"
  style?: "normal" | "italic" | "oblique" | string; // allow oblique with degrees
  stretch?: string; // "normal" | "condensed" | etc.
  display?: FontFaceDescriptors["display"];
};

export type FontSource =
  | { kind: "url"; url: string }
  | { kind: "buffer"; bytes: ArrayBuffer }
  | { kind: "file"; file: File };

export interface FontAdapterHandle {
  // Adapter-specific pointer/handle (e.g., wasm face id or DOM FontFace)
  id: unknown;
}

export interface FontAdapter {
  /** Called when font bytes need to be registered for a variant. Should be idempotent. */
  onRegister(bytes: ArrayBuffer, v: FontVariant): Promise<FontAdapterHandle>;
  /** Called when font should be unregistered (best-effort; browsers may keep in memory). */
  onUnregister(handle: FontAdapterHandle, v: FontVariant): void;
  /** Optional: called to check if the variant is already usable */
  onCheck?(v: FontVariant): boolean | Promise<boolean>;
}

// ---------- Font Variant Parsing (preserved from original) ----------

/**
 * Maps variant strings to CSS font-weight and font-style values
 */
const VARIANT_MAP: Record<string, { weight: string; style: string }> = {
  "100": { weight: "100", style: "normal" },
  "100italic": { weight: "100", style: "italic" },
  "200": { weight: "200", style: "normal" },
  "200italic": { weight: "200", style: "italic" },
  "300": { weight: "300", style: "normal" },
  "300italic": { weight: "300", style: "italic" },
  regular: { weight: "400", style: "normal" },
  italic: { weight: "400", style: "italic" },
  "500": { weight: "500", style: "normal" },
  "500italic": { weight: "500", style: "italic" },
  "600": { weight: "600", style: "normal" },
  "600italic": { weight: "600", style: "italic" },
  "700": { weight: "700", style: "normal" },
  "700italic": { weight: "700", style: "italic" },
  "800": { weight: "800", style: "normal" },
  "800italic": { weight: "800", style: "italic" },
  "900": { weight: "900", style: "normal" },
  "900italic": { weight: "900", style: "italic" },
};

/**
 * Converts a variant string to FontVariant object
 */
export function parseVariant(variant: string, family: string): FontVariant {
  const { weight, style } = VARIANT_MAP[variant] || {
    weight: "400",
    style: "normal",
  };
  return {
    family,
    weight,
    style: style as "normal" | "italic",
    stretch: "normal",
    display: "auto",
  };
}

/**
 * Determines the font format from a URL
 */
function getFontFormat(url: string): string {
  const extension = url.split(".").pop()?.toLowerCase();

  switch (extension) {
    case "woff2":
      return "woff2";
    case "woff":
      return "woff";
    case "ttf":
      return "truetype";
    case "otf":
      return "opentype";
    case "eot":
      return "embedded-opentype";
    default:
      return "truetype"; // fallback
  }
}

/**
 * Creates FontVariant objects for a static font family
 */
export function createStaticFontVariants(
  font: GoogleWebFontListItem
): Array<{ variant: FontVariant; source: FontSource }> {
  const variants: Array<{ variant: FontVariant; source: FontSource }> = [];

  for (const [variantStr, url] of Object.entries(font.files)) {
    const variant = parseVariant(variantStr, font.family);
    const source: FontSource = { kind: "url", url };
    variants.push({ variant, source });
  }

  return variants;
}

/**
 * Creates FontVariant objects for a variable font family
 */
export function createVariableFontVariants(
  font: GoogleWebFontListItem
): Array<{ variant: FontVariant; source: FontSource }> {
  const variants: Array<{ variant: FontVariant; source: FontSource }> = [];

  if (!font.axes || font.axes.length === 0) {
    // Fallback to static font creation if no axes defined
    return createStaticFontVariants(font);
  }

  // For variable fonts, we typically have one file with all variants
  // We'll create FontVariant objects for each variant that maps to the variable font
  for (const variantStr of font.variants) {
    const url = font.files[variantStr];
    if (!url) continue;

    const { weight, style } = parseVariant(variantStr, font.family);

    // For variable fonts, we need to determine the weight range
    const weightAxis = font.axes.find((axis) => axis.tag === "wght");
    const weightRange = weightAxis
      ? `${weightAxis.start} ${weightAxis.end}`
      : weight;

    // Handle width axis for font-stretch
    const widthAxis = font.axes.find((axis) => axis.tag === "wdth");
    const stretch = widthAxis
      ? `${widthAxis.start}% ${widthAxis.end}%`
      : "normal";

    // Handle slant axis for font-style: oblique
    const slantAxis = font.axes.find((axis) => axis.tag === "slnt");
    let finalStyle = style;
    if (slantAxis && slantAxis.start !== 0) {
      // If slant axis exists and has non-zero values, use oblique
      finalStyle = `oblique ${slantAxis.start}deg ${slantAxis.end}deg`;
    }

    const variant: FontVariant = {
      family: font.family,
      weight: weightRange,
      style: finalStyle as "normal" | "italic" | "oblique",
      stretch,
      display: "swap",
    };

    const source: FontSource = { kind: "url", url };
    variants.push({ variant, source });
  }

  return variants;
}

// ---------- Core manager (no document.fonts dependency) ----------

type Key = string;
const keyOf = (v: FontVariant) =>
  `${v.family}__w:${v.weight ?? "400"}__s:${v.style ?? "normal"}__st:${v.stretch ?? "normal"}`;

export class UnifiedFontManager {
  private capacity: number | null;

  constructor(
    private adapter: FontAdapter,
    private opts: { capacity?: number; fetch?: typeof fetch } = {}
  ) {
    this.capacity = this.opts.capacity ?? null;
  }

  private bytesCache = new Map<Key, ArrayBuffer>(); // raw font file cache
  private handles = new Map<Key, FontAdapterHandle>(); // adapter registrations
  private refs = new Map<Key, number>();
  private lru: Key[] = [];

  async acquire(src: FontSource, v: FontVariant): Promise<FontAdapterHandle> {
    const k = keyOf(v);
    // already registered
    const h = this.handles.get(k);
    if (h) {
      this.bumpRef(k);
      this.touch(k);
      return h;
    }
    const bytes = await this.resolveBytes(src, k);
    const handle = await this.adapter.onRegister(bytes, v);
    this.handles.set(k, handle);
    this.refs.set(k, 1);
    this.touch(k);
    this.evictIfNeeded();
    return handle;
  }

  /** decrement usage; if zero, keep as warm cache until eviction */
  release(v: FontVariant, opts: { immediate?: boolean } = {}) {
    const k = keyOf(v);
    const r = (this.refs.get(k) ?? 0) - 1;
    if (r > 0) return void this.refs.set(k, r);
    this.refs.delete(k);
    if (opts.immediate) this.unregister(k, v);
    else this.touch(k); // mark cold
  }

  /** remove from adapter + caches */
  private unregister(k: Key, v: FontVariant) {
    const h = this.handles.get(k);
    if (h) {
      this.adapter.onUnregister(h, v);
      this.handles.delete(k);
    }
    // keep bytesCache (helps quick re-register); remove via LRU only
  }

  private async resolveBytes(src: FontSource, k: Key): Promise<ArrayBuffer> {
    const cached = this.bytesCache.get(k);
    if (cached) return cached;
    let bytes: ArrayBuffer;
    if (src.kind === "buffer") bytes = src.bytes;
    else if (src.kind === "file") bytes = await src.file.arrayBuffer();
    else {
      const res = await fetch(src.url, { cache: "force-cache" });
      if (!res.ok) throw new Error(`Font fetch failed: ${res.status}`);
      bytes = await res.arrayBuffer();
    }
    this.bytesCache.set(k, bytes);
    return bytes;
  }

  private evictIfNeeded() {
    // Skip eviction if capacity is null (unlimited)
    if (this.capacity === null) return;

    // evict adapter registrations with ref==0 first
    while (this.handles.size > this.capacity) {
      const victim = this.lru.find((k) => !this.refs.has(k));
      if (!victim) break;
      // need variant to unregister
      const [family, w, s, st] = victim.split("__").map((x) => x.split(":")[1]);
      this.unregister(victim, {
        family,
        weight: w,
        style: s as any,
        stretch: st,
      });
      // optionally also trim bytes cache when very large:
      // this.bytesCache.delete(victim);
    }
  }
  private touch(k: Key) {
    const i = this.lru.indexOf(k);
    if (i >= 0) this.lru.splice(i, 1);
    this.lru.push(k);
  }
  private bumpRef(k: Key) {
    this.refs.set(k, (this.refs.get(k) ?? 0) + 1);
  }

  // convenience
  inUseCount() {
    return [...this.refs.values()].reduce((a, b) => a + (b > 0 ? 1 : 0), 0);
  }

  // Google Fonts integration
  async loadGoogleFont(font: GoogleWebFontListItem): Promise<void> {
    const variants =
      font.axes && font.axes.length > 0
        ? createVariableFontVariants(font)
        : createStaticFontVariants(font);

    const loadPromises = variants.map(({ variant, source }) =>
      this.acquire(source, variant)
    );
    await Promise.all(loadPromises);
  }

  async loadGoogleFonts(fonts: GoogleWebFontListItem[]): Promise<void> {
    const loadPromises = fonts.map((font) => this.loadGoogleFont(font));
    await Promise.all(loadPromises);
  }

  checkGoogleFont(family: string): boolean | Promise<boolean> {
    return this.adapter.onCheck?.({ family }) ?? false;
  }
}
