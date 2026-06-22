// `.canvas` — pure core (no IO).
//
// This module is the sovereign logic of the format: parsing the manifest,
// reconciling it against the directory listing, and serializing it back. It
// has no filesystem, no clock, no global state — plain functions over plain
// inputs, so the vitest suite exercises it with zero mocks.
//
// Contract reference: docs/wg/format/canvas.md (the `.canvas` Draft-V1 RFD).
// The reconcile rule, in one line: the manifest is authoritative for ORDER and
// PLACEMENT; disk is authoritative for EXISTENCE.

// ──────────────────────────────────────────────────────────────────────────
// Filesystem port
// ──────────────────────────────────────────────────────────────────────────

/**
 * The minimal read surface a `.canvas` reader needs. Structurally satisfied by
 * `AgentFs.Backend` (so the desktop can pass its workspace backend unchanged)
 * and by a trivial `Map`-backed object in tests. Paths are POSIX and
 * root-relative; `..`-escape and absolute paths are out of scope for V1.
 */
export interface ReadableFs {
  /** Enumerate every path in the bundle. Order undefined. */
  list(): Promise<string[]>;
  /** Read the text at `path`, or `null` if no such file. */
  read(path: string): Promise<string | null>;
}

/** `ReadableFs` plus the single write the writer needs. */
export interface WritableFs extends ReadableFs {
  /** Write `content` to `path`, overwriting any prior content. */
  write(path: string, content: string): Promise<void>;
}

// ──────────────────────────────────────────────────────────────────────────
// Authored manifest types (a tolerant superset; unknown fields are preserved)
// ──────────────────────────────────────────────────────────────────────────

/** 2D placement on the canvas view. Every field optional. */
export type Layout = {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  z?: number;
};

/** One entry in the manifest `documents[]` list. `src` is the only field that
 *  carries meaning by itself; unknown fields are kept for round-trip. */
export type ManifestDocument = {
  src: string;
  id?: string;
  layout?: Layout;
  [key: string]: unknown;
};

/** `canvas.json` as authored. The minimal valid manifest is `{}`. Unknown
 *  top-level fields are retained so a newer writer's data survives round-trip. */
export type Manifest = {
  version?: string;
  $schema?: string;
  type?: string;
  thumbnail?: string;
  documents?: ManifestDocument[];
  ext?: Record<string, unknown>;
  [key: string]: unknown;
};

// ──────────────────────────────────────────────────────────────────────────
// Resolved (read-side projection) types
// ──────────────────────────────────────────────────────────────────────────

export type CanvasType = "svg-slides" | "unknown";

export type WarningCode =
  | "manifest_malformed"
  | "missing_src"
  | "duplicate_identity"
  | "thumbnail_ambiguous"
  | "unknown_type";

/** A non-fatal observation. Readers degrade and warn; they never hard-fail. */
export type Warning = { code: WarningCode; message: string; path?: string };

export type ResolvedDocument = {
  /** The path as authored (manifest `src`) or as found on disk. */
  src: string;
  /** Resolved identity: manifest `id` when present, else `src`. */
  id: string;
  /** Canvas-view placement, or `null` when none was authored. */
  layout: Layout | null;
  /** Always `true` here — non-existent entries are skipped during resolve. */
  exists: boolean;
  /** Whether this came from the manifest list or was appended from disk. */
  origin: "manifest" | "disk";
};

/** The derived, reconciled view a consumer renders from. Rebuilt on every
 *  read — never a cache, never the source of truth. */
export type ResolvedCanvas = {
  /** `declared` = `canvas.json` parsed OK; `implicit` = absent or malformed. */
  mode: "declared" | "implicit";
  type: CanvasType;
  version: string | null;
  /** Resolved thumbnail path, or `null`. */
  thumbnail: string | null;
  /** Final reconciled order (the slides view); `layout` is the canvas view. */
  documents: ResolvedDocument[];
  ext: Record<string, unknown>;
  warnings: Warning[];
  /** The parsed manifest (or `null` in implicit mode). This is the round-trip
   *  source: a consumer that edits then writes back mutates THIS and passes it
   *  to `write`, so unknown fields survive. */
  manifest: Manifest | null;
};

// ──────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────

/** The marker file whose presence declares a directory a `.canvas`. */
export const MANIFEST_FILENAME = "canvas.json";

/**
 * The directory-name extension (leading dot included) that names a `.canvas`
 * bundle. A bundle is a *directory* whose name ends with this — the macOS
 * "package" convention: one document that is physically a folder on disk.
 */
export const BUNDLE_EXTENSION = ".canvas";

/**
 * Does `path` name a `.canvas` bundle? Suffix match on {@link BUNDLE_EXTENSION},
 * case-insensitive. This is the cheap, path-only signal — no fs probe — for UI
 * affordances (tree view, open routing) where probing every folder for a
 * {@link MANIFEST_FILENAME} is too expensive. Callers that have it combine this
 * with "is a directory" (a bundle is always a directory; a plain file that
 * happens to end in `.canvas` is not one).
 */
export function isBundlePath(path: string): boolean {
  return path.toLowerCase().endsWith(BUNDLE_EXTENSION);
}

/** Thumbnail filenames by convention, in precedence order (first wins). */
export const THUMBNAIL_NAMES = [
  "thumbnail.png",
  "thumbnail.svg",
  "thumbnail.jpg",
  "thumbnail.jpeg",
] as const;

// ──────────────────────────────────────────────────────────────────────────
// Parse (package-internal; `read` wraps it, so it is not part of the public API)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Tolerantly parse manifest text. Returns `{ manifest: null, warning }` for
 * anything that isn't a JSON object — the caller degrades to implicit mode.
 */
export function parse(text: string): {
  manifest: Manifest | null;
  warning: Warning | null;
} {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return {
      manifest: null,
      warning: {
        code: "manifest_malformed",
        message: "canvas.json is not valid JSON",
        path: MANIFEST_FILENAME,
      },
    };
  }
  if (!isObject(value)) {
    return {
      manifest: null,
      warning: {
        code: "manifest_malformed",
        message: "canvas.json must be a JSON object",
        path: MANIFEST_FILENAME,
      },
    };
  }
  return { manifest: value as Manifest, warning: null };
}

// ──────────────────────────────────────────────────────────────────────────
// Resolve — the heart. Maps 1:1 to RFD §5.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Reconcile a manifest (or `null`, for implicit mode) against a directory
 * listing into the projection a consumer renders.
 *
 * @param manifest    parsed manifest, or `null` (missing / malformed)
 * @param rootEntries every path in the bundle (as from `fs.list()`)
 */
export function resolve(
  manifest: Manifest | null,
  rootEntries: string[]
): ResolvedCanvas {
  const warnings: Warning[] = [];

  // Disk views: a set of all normalized paths (for existence) and the sorted
  // list of root-level SVGs (for derivation / appension).
  const diskAll = new Set<string>();
  const diskRootSvgs: string[] = [];
  for (const entry of rootEntries) {
    const n = norm(entry);
    if (n.length === 0) continue;
    diskAll.add(n);
    const root = rootName(entry);
    if (root && isSvg(root)) diskRootSvgs.push(root);
  }
  diskRootSvgs.sort(); // lexical by filename (the `000.svg` convention)

  const mode: ResolvedCanvas["mode"] = manifest ? "declared" : "implicit";
  const type = resolveType(manifest?.type, warnings);

  // A root-level thumbnail is the bundle COVER, not a slide. Exclude the
  // convention names (and an explicit `thumbnail` target) from the SVGs that get
  // derived/appended as documents — otherwise a `thumbnail.svg` would surface as
  // both the cover and a phantom slide. A manifest that lists the file as a
  // `src` is still honored (the author meant it); only the disk-side
  // derive/append is filtered.
  const explicitThumb =
    typeof manifest?.thumbnail === "string" && manifest.thumbnail
      ? norm(manifest.thumbnail)
      : null;
  const isReservedThumbnail = (name: string): boolean => {
    const n = norm(name);
    return (
      (THUMBNAIL_NAMES as readonly string[]).includes(n) || n === explicitThumb
    );
  };
  const slideSvgs = diskRootSvgs.filter((name) => !isReservedThumbnail(name));

  const documents = resolveDocuments(
    manifest?.documents,
    diskAll,
    slideSvgs,
    warnings
  );

  return {
    mode,
    type,
    version: typeof manifest?.version === "string" ? manifest.version : null,
    thumbnail: resolveThumbnail(manifest, diskAll, warnings),
    documents,
    ext: manifest && isObject(manifest.ext) ? manifest.ext : {},
    warnings,
    manifest: manifest ?? null,
  };
}

function resolveType(
  rawType: string | undefined,
  warnings: Warning[]
): CanvasType {
  if (rawType === "svg-slides") return "svg-slides";
  // Unrecognized non-empty type → treated as "unknown", never an error.
  if (
    typeof rawType === "string" &&
    rawType.length > 0 &&
    rawType !== "unknown"
  ) {
    warnings.push({
      code: "unknown_type",
      message: `unrecognized type "${rawType}"; treated as "unknown"`,
    });
  }
  return "unknown";
}

function resolveDocuments(
  entries: ManifestDocument[] | undefined,
  diskAll: Set<string>,
  diskRootSvgs: string[],
  warnings: Warning[]
): ResolvedDocument[] {
  // documents absent → derive entirely from disk, lexical order. Disk is
  // authoritative for both existence and order in this branch.
  if (!Array.isArray(entries)) {
    return diskRootSvgs.map((name) => ({
      src: name,
      id: name,
      layout: null,
      exists: true,
      origin: "disk",
    }));
  }

  const documents: ResolvedDocument[] = [];
  const seenIdentity = new Set<string>();
  const referencedSrc = new Set<string>();

  // Manifest is authoritative for ORDER; disk for EXISTENCE.
  for (const entry of entries) {
    if (!isObject(entry) || typeof entry.src !== "string" || !entry.src) {
      continue; // junk entry with no usable src — skip (failure is nature)
    }
    const src = entry.src;
    const nsrc = norm(src);
    const identity = typeof entry.id === "string" && entry.id ? entry.id : src;

    // Disk wins for existence: a src pointing at a missing file is skipped.
    if (!diskAll.has(nsrc)) {
      warnings.push({
        code: "missing_src",
        message: `document "${src}" not found on disk; skipped`,
        path: src,
      });
      continue;
    }

    // Two entries sharing an id/src → keep the first.
    if (seenIdentity.has(identity)) {
      warnings.push({
        code: "duplicate_identity",
        message: `duplicate document identity "${identity}"; keeping the first`,
        path: src,
      });
      continue;
    }

    seenIdentity.add(identity);
    referencedSrc.add(nsrc);
    documents.push({
      src,
      id: identity,
      layout: normalizeLayout(entry.layout),
      exists: true,
      origin: "manifest",
    });
  }

  // Disk wins for existence: root SVGs not named by the manifest are appended
  // after the listed ones (manifest order is preserved, disk-only is additive).
  for (const name of diskRootSvgs) {
    if (referencedSrc.has(norm(name)) || seenIdentity.has(name)) continue;
    seenIdentity.add(name);
    documents.push({
      src: name,
      id: name,
      layout: null,
      exists: true,
      origin: "disk",
    });
  }

  return documents;
}

function resolveThumbnail(
  manifest: Manifest | null,
  diskAll: Set<string>,
  warnings: Warning[]
): string | null {
  // An explicit field overrides the filename convention, as authored.
  const explicit = manifest?.thumbnail;
  if (typeof explicit === "string" && explicit.length > 0) return explicit;

  // Convention: THUMBNAIL_NAMES is already in precedence order (png > svg >
  // jpg > jpeg), and Array.filter preserves it — so present[0] is the winner.
  const present = THUMBNAIL_NAMES.filter((n) => diskAll.has(n));
  if (present.length === 0) return null;
  if (present.length > 1) {
    warnings.push({
      code: "thumbnail_ambiguous",
      message: `multiple thumbnails found (${present.join(", ")}); using ${present[0]}`,
    });
  }
  return present[0];
}

// ──────────────────────────────────────────────────────────────────────────
// Serialize — stable JSON, unknown fields preserved (RFD §8)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Serialize a manifest to stable JSON (deep-sorted keys, 2-space indent,
 * trailing newline) so `git` diffs stay legible. Array order — including
 * `documents[]` — is preserved; only object keys are sorted. `ext` and unknown
 * fields pass through untouched.
 */
export function serialize(manifest: Manifest): string {
  return JSON.stringify(sortKeysDeep(manifest), null, 2) + "\n";
}

// ──────────────────────────────────────────────────────────────────────────
// Edit — pure manifest transforms. `(manifest, …) -> manifest`, same shape as
// `resolve`/`serialize`. Every transform:
//   • returns a NEW manifest (the input is never mutated — a caller may still
//     hold the manifest it read and round-trip it),
//   • preserves unknown top-level fields, `ext`, and every per-document field
//     including each entry's own unknown fields and `ext` (round-trip is
//     sovereign),
//   • is tolerant — an operation that can't apply is a no-op, never a throw
//     ("failure is nature", consistent with the reader degrading on bad input).
//
// Identity here matches `resolve`'s rule exactly: a document's identity is its
// `id` when present and non-empty, else its `src`. The package owns this
// invariant — `resolve` already warns on `duplicate_identity`; these transforms
// refuse to create that condition rather than re-warning about it after the
// fact.
// ──────────────────────────────────────────────────────────────────────────

/** Identity of a manifest document — `id` when present & non-empty, else `src`.
 *  The same rule `resolve` uses; transforms key off it so they can never
 *  introduce a `duplicate_identity` that `resolve` would warn about. */
function identityOf(doc: ManifestDocument): string {
  return typeof doc.id === "string" && doc.id ? doc.id : doc.src;
}

/** The current `documents[]` as a fresh array (tolerant: absent/non-array → []).
 *  Each entry is the original object reference — transforms build new entries
 *  only where they change something, so unknown fields ride along untouched. */
function documentsOf(manifest: Manifest): ManifestDocument[] {
  return Array.isArray(manifest.documents) ? [...manifest.documents] : [];
}

/**
 * Append a document to `documents[]`.
 *
 * The new entry's identity (`id ?? src`) is checked against every existing
 * entry's identity; if it collides, the manifest is returned **unchanged** (a
 * no-op, never a throw — mirrors `resolve` keeping the first of a duplicate).
 * `layout` is normalized (finite numeric fields only; an empty layout is
 * dropped). The input manifest is not mutated.
 */
export function add(
  manifest: Manifest,
  entry: { src: string; id?: string; layout?: Layout }
): Manifest {
  const src = entry.src;
  if (typeof src !== "string" || !src) return manifest; // no usable src → no-op

  const next: ManifestDocument = { src };
  if (typeof entry.id === "string" && entry.id) next.id = entry.id;
  const layout = normalizeLayout(entry.layout);
  if (layout) next.layout = layout;

  const documents = documentsOf(manifest);
  const identity = identityOf(next);
  for (const doc of documents) {
    if (isObject(doc) && typeof doc.src === "string" && doc.src) {
      if (identityOf(doc) === identity) return manifest; // duplicate identity → no-op
    }
  }

  return { ...manifest, documents: [...documents, next] };
}

/**
 * Drop the document whose identity (`id ?? src`) equals `idOrSrc`. An absent
 * key is a no-op — the manifest is returned unchanged. The input is not
 * mutated; only the first match is removed (there is at most one under the
 * identity invariant these transforms maintain).
 */
export function remove(manifest: Manifest, idOrSrc: string): Manifest {
  const documents = documentsOf(manifest);
  const index = documents.findIndex(
    (doc) =>
      isObject(doc) &&
      typeof doc.src === "string" &&
      doc.src.length > 0 &&
      identityOf(doc) === idOrSrc
  );
  if (index === -1) return manifest; // absent key → no-op
  documents.splice(index, 1);
  return { ...manifest, documents };
}

/**
 * Reorder `documents[]` by identity (`id ?? src`). Entries named in
 * `orderedKeys` come first, in the order given; entries not named keep their
 * original relative order and follow. The document **set is unchanged** — only
 * order differs. Unknown keys in `orderedKeys` (and repeats) are ignored; each
 * existing document is placed at most once. The input is not mutated.
 */
export function reorder(manifest: Manifest, orderedKeys: string[]): Manifest {
  const documents = documentsOf(manifest);
  const valid = documents.filter(
    (doc) => isObject(doc) && typeof doc.src === "string" && doc.src.length > 0
  );
  const rest = documents.filter((doc) => !valid.includes(doc));

  const byIdentity = new Map<string, ManifestDocument>();
  for (const doc of valid) {
    const identity = identityOf(doc);
    if (!byIdentity.has(identity)) byIdentity.set(identity, doc);
  }

  const ordered: ManifestDocument[] = [];
  const placed = new Set<ManifestDocument>();
  for (const key of orderedKeys) {
    const doc = byIdentity.get(key);
    if (doc && !placed.has(doc)) {
      ordered.push(doc);
      placed.add(doc);
    }
  }
  // Unnamed valid entries keep their original relative order, appended after.
  for (const doc of valid) {
    if (!placed.has(doc)) ordered.push(doc);
  }

  return { ...manifest, documents: [...ordered, ...rest] };
}

/**
 * Set or clear a document's canvas-view placement. `layout` is normalized
 * (finite numeric fields only); `null` — or a layout that normalizes to empty —
 * clears placement (drops the `layout` field entirely). An absent `idOrSrc` is
 * a no-op. The input, and every other entry, are left untouched.
 */
export function setLayout(
  manifest: Manifest,
  idOrSrc: string,
  layout: Layout | null
): Manifest {
  const documents = documentsOf(manifest);
  const index = documents.findIndex(
    (doc) =>
      isObject(doc) &&
      typeof doc.src === "string" &&
      doc.src.length > 0 &&
      identityOf(doc) === idOrSrc
  );
  if (index === -1) return manifest; // absent key → no-op

  const normalized = normalizeLayout(layout);
  const current = documents[index];
  const updated: ManifestDocument = { ...current };
  if (normalized) updated.layout = normalized;
  else delete updated.layout;

  documents[index] = updated;
  return { ...manifest, documents };
}

// ──────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Strip a single leading `./` then a single leading `/`. */
function norm(path: string): string {
  let p = path.trim();
  if (p.startsWith("./")) p = p.slice(2);
  if (p.startsWith("/")) p = p.slice(1);
  return p;
}

/** Normalized basename iff `path` is a root-level entry, else `null`. */
function rootName(path: string): string | null {
  const p = norm(path);
  if (p.length === 0 || p.includes("/")) return null;
  return p;
}

function isSvg(name: string): boolean {
  return name.toLowerCase().endsWith(".svg");
}

/** Keep only finite numeric layout fields; drop empty layouts to `null`. */
function normalizeLayout(layout: unknown): Layout | null {
  if (!isObject(layout)) return null;
  const out: Layout = {};
  for (const k of ["x", "y", "w", "h", "z"] as const) {
    const v = layout[k];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (isObject(value)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) out[k] = sortKeysDeep(value[k]);
    return out;
  }
  return value;
}
