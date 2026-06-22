import { describe, expect, it } from "vitest";
import { dotcanvas } from "./index";

const { add, heal, remove, reorder, resolve, serialize, setLayout, setSkip } =
  dotcanvas;

describe("isBundlePath — `.canvas` package suffix", () => {
  it("matches the `.canvas` extension, case-insensitively", () => {
    expect(dotcanvas.isBundlePath("deck.canvas")).toBe(true);
    expect(dotcanvas.isBundlePath("/a/b/intro.canvas")).toBe(true);
    expect(dotcanvas.isBundlePath("Deck.Canvas")).toBe(true);
  });

  it("rejects non-bundle paths", () => {
    expect(dotcanvas.isBundlePath("deck.svg")).toBe(false);
    expect(dotcanvas.isBundlePath("canvas")).toBe(false);
    expect(dotcanvas.isBundlePath("a/canvas.json")).toBe(false);
  });
});

describe("resolve — RFD §5 reconcile", () => {
  it("minimal valid manifest {} → empty declared deck", () => {
    const c = resolve({}, []);
    expect(c.mode).toBe("declared");
    expect(c.type).toBe("unknown");
    expect(c.documents).toEqual([]);
    expect(c.thumbnail).toBeNull();
    expect(c.ext).toEqual({});
    expect(c.warnings).toEqual([]);
  });

  it("manifest is authoritative for order; disk is authoritative for existence", () => {
    // manifest lists b before a; both exist on disk → resolved order is b, a.
    const c = resolve({ documents: [{ src: "b.svg" }, { src: "a.svg" }] }, [
      "a.svg",
      "b.svg",
    ]);
    expect(c.documents.map((d) => d.src)).toEqual(["b.svg", "a.svg"]);
    expect(c.documents.every((d) => d.origin === "manifest")).toBe(true);
    expect(c.documents.every((d) => d.exists)).toBe(true);
    expect(c.warnings).toEqual([]);
  });

  it("documents absent → derive from disk, lexical by filename", () => {
    const c = resolve({}, ["010.svg", "001.svg", "002.svg"]);
    expect(c.documents.map((d) => d.src)).toEqual([
      "001.svg",
      "002.svg",
      "010.svg",
    ]);
    expect(c.documents.every((d) => d.origin === "disk")).toBe(true);
  });

  it("documents[].src missing on disk → skip with warning", () => {
    const c = resolve(
      { documents: [{ src: "a.svg" }, { src: "missing.svg" }] },
      ["a.svg"]
    );
    expect(c.documents.map((d) => d.src)).toEqual(["a.svg"]);
    expect(c.warnings).toEqual([
      {
        code: "missing_src",
        message: 'document "missing.svg" not found on disk; skipped',
        path: "missing.svg",
      },
    ]);
  });

  it("disk SVGs not in documents → appended after listed ones", () => {
    const c = resolve({ documents: [{ src: "b.svg" }] }, [
      "a.svg",
      "b.svg",
      "c.svg",
    ]);
    expect(c.documents.map((d) => [d.src, d.origin])).toEqual([
      ["b.svg", "manifest"],
      ["a.svg", "disk"],
      ["c.svg", "disk"],
    ]);
  });

  it("two entries share id/src → keep the first (duplicate warning)", () => {
    const c = resolve({ documents: [{ src: "a.svg" }, { src: "a.svg" }] }, [
      "a.svg",
    ]);
    expect(c.documents.map((d) => d.src)).toEqual(["a.svg"]);
    expect(c.warnings.map((w) => w.code)).toEqual(["duplicate_identity"]);
  });

  it("explicit id is the identity; absent id falls back to src", () => {
    const c = resolve(
      { documents: [{ src: "001.svg", id: "n_a1b2" }, { src: "002.svg" }] },
      ["001.svg", "002.svg"]
    );
    expect(c.documents.map((d) => d.id)).toEqual(["n_a1b2", "002.svg"]);
  });

  it("unrecognized type → unknown (+ warning); unknown top-level + ext preserved", () => {
    const c = resolve(
      { type: "mind-map", foo: "bar", ext: { vendor: { a: 1 } } },
      []
    );
    expect(c.type).toBe("unknown");
    expect(c.warnings.map((w) => w.code)).toEqual(["unknown_type"]);
    expect(c.ext).toEqual({ vendor: { a: 1 } });
    // The raw manifest is carried verbatim for round-trip.
    expect(c.manifest?.foo).toBe("bar");
  });

  it('recognized type "svg-slides" resolves without warning', () => {
    const c = resolve({ type: "svg-slides" }, []);
    expect(c.type).toBe("svg-slides");
    expect(c.warnings).toEqual([]);
  });

  it("resolved documents carry their source manifest entry as meta (disk-origin → undefined)", () => {
    const entry = { src: "a.svg", id: "n_a", name: "Intro", hidden: true };
    const c = resolve({ documents: [entry] }, ["a.svg", "b.svg"]);
    // manifest-origin: meta is the source entry, unknown fields (name/hidden) and all.
    expect(c.documents[0].origin).toBe("manifest");
    expect(c.documents[0].meta).toEqual(entry);
    // disk-appended: no authored entry → meta undefined.
    expect(c.documents[1].origin).toBe("disk");
    expect(c.documents[1].meta).toBeUndefined();
    // derive-from-disk (documents absent) is also disk-origin → meta undefined.
    expect(resolve({}, ["c.svg"]).documents[0].meta).toBeUndefined();
  });
});

describe("resolve — thumbnail", () => {
  it("explicit field overrides the filename convention (no ambiguity warning)", () => {
    const c = resolve({ thumbnail: "cover.png" }, ["thumbnail.svg"]);
    expect(c.thumbnail).toBe("cover.png");
    expect(c.warnings).toEqual([]);
  });

  it("convention precedence: png > svg > jpg > jpeg (multiple → warning)", () => {
    const c = resolve({}, [
      "thumbnail.jpeg",
      "thumbnail.jpg",
      "thumbnail.svg",
      "thumbnail.png",
    ]);
    expect(c.thumbnail).toBe("thumbnail.png");
    expect(c.warnings.map((w) => w.code)).toEqual(["thumbnail_ambiguous"]);
  });

  it("a single thumbnail resolves without warning", () => {
    const c = resolve({}, ["thumbnail.jpeg", "a.svg"]);
    expect(c.thumbnail).toBe("thumbnail.jpeg");
    expect(c.warnings).toEqual([]);
  });

  it("no thumbnail present → null", () => {
    const c = resolve({}, ["a.svg"]);
    expect(c.thumbnail).toBeNull();
  });

  it("a root thumbnail.svg is the cover, not an appended slide", () => {
    const c = resolve({ documents: [{ src: "001.svg" }] }, [
      "001.svg",
      "thumbnail.svg",
    ]);
    expect(c.documents.map((d) => d.src)).toEqual(["001.svg"]);
    expect(c.thumbnail).toBe("thumbnail.svg");
  });

  it("derive-from-disk treats thumbnail.svg as the cover, not a slide", () => {
    const c = resolve({}, ["001.svg", "thumbnail.svg"]);
    expect(c.documents.map((d) => d.src)).toEqual(["001.svg"]);
    expect(c.thumbnail).toBe("thumbnail.svg");
  });

  it("an explicit thumbnail SVG is excluded from derived slides", () => {
    const c = resolve({ thumbnail: "cover.svg" }, ["001.svg", "cover.svg"]);
    expect(c.documents.map((d) => d.src)).toEqual(["001.svg"]);
    expect(c.thumbnail).toBe("cover.svg");
  });

  it("a manifest that lists the thumbnail file as a doc is still honored", () => {
    const c = resolve({ documents: [{ src: "thumbnail.svg" }] }, [
      "thumbnail.svg",
    ]);
    expect(c.documents.map((d) => d.src)).toEqual(["thumbnail.svg"]);
  });
});

describe("resolve — tolerance", () => {
  it("leading slashes in disk paths normalize to root entries", () => {
    const c = resolve({}, ["/001.svg", "/002.svg"]);
    expect(c.documents.map((d) => d.src)).toEqual(["001.svg", "002.svg"]);
  });

  it("nested paths are not treated as root-level slides", () => {
    const c = resolve({}, ["assets/icon.svg", "001.svg"]);
    expect(c.documents.map((d) => d.src)).toEqual(["001.svg"]);
  });

  it("layout keeps only finite numeric fields; empty layout → null", () => {
    const c = resolve(
      {
        documents: [
          { src: "a.svg", layout: { x: 1, y: 2, w: 3, h: 4, z: 5 } },
          { src: "b.svg", layout: {} },
        ],
      },
      ["a.svg", "b.svg"]
    );
    expect(c.documents[0].layout).toEqual({ x: 1, y: 2, w: 3, h: 4, z: 5 });
    expect(c.documents[1].layout).toBeNull();
  });
});

describe("serialize — stable, lossless (RFD §8)", () => {
  it("serialize preserves ext + unknown fields; stable (sorted keys, trailing newline)", () => {
    const manifest: dotcanvas.Manifest = {
      type: "svg-slides",
      version: "1",
      zzz: "keep",
      documents: [{ src: "b.svg" }, { src: "a.svg" }],
      ext: { z: 1, a: 2 },
    };
    const out = serialize(manifest);

    // Trailing newline + 2-space indent.
    expect(out.endsWith("\n")).toBe(true);
    expect(out).toContain('\n  "');

    // Top-level keys are sorted.
    const at = (k: string) => out.indexOf(`"${k}"`);
    expect(at("documents")).toBeLessThan(at("ext"));
    expect(at("ext")).toBeLessThan(at("type"));
    expect(at("type")).toBeLessThan(at("version"));
    expect(at("version")).toBeLessThan(at("zzz"));

    // Array order (documents) is preserved, not sorted.
    const parsed = JSON.parse(out) as dotcanvas.Manifest;
    expect(parsed.documents?.map((d) => d.src)).toEqual(["b.svg", "a.svg"]);

    // Round-trips structurally (key order aside).
    expect(parsed).toEqual(manifest);
  });
});

describe("heal — read→writable reconcile (R3)", () => {
  it("heal drops missing src, appends disk-only SVGs, preserves id/layout/skip/unknown per-doc fields", () => {
    const manifest: dotcanvas.Manifest = {
      type: "svg-slides",
      documents: [
        {
          src: "a.svg",
          id: "n_a",
          name: "Intro",
          skip: true,
          layout: { x: 1, y: 2 },
        },
        { src: "gone.svg" }, // missing on disk → dropped
      ],
    };
    // b.svg exists on disk but isn't listed → appended after the surviving entry.
    const healed = heal(manifest, ["a.svg", "b.svg"]);
    expect(healed.documents).toEqual([
      // `skip` (and `name`) ride through untouched on the source entry (`meta`).
      {
        src: "a.svg",
        id: "n_a",
        name: "Intro",
        skip: true,
        layout: { x: 1, y: 2 },
      },
      { src: "b.svg", id: "b.svg" },
    ]);
  });

  it("heal preserves unknown top-level fields and ext", () => {
    const manifest: dotcanvas.Manifest = {
      type: "svg-slides",
      version: "1",
      foo: "keep",
      ext: { vendor: { a: 1 } },
      documents: [{ src: "a.svg" }],
    };
    const healed = heal(manifest, ["a.svg"]);
    expect(healed.type).toBe("svg-slides");
    expect(healed.version).toBe("1");
    expect(healed.foo).toBe("keep");
    expect(healed.ext).toEqual({ vendor: { a: 1 } });
  });

  it("heal(null, entries) derives a writable manifest from disk", () => {
    const healed = heal(null, ["002.svg", "001.svg"]);
    expect(healed.documents).toEqual([
      { src: "001.svg", id: "001.svg" },
      { src: "002.svg", id: "002.svg" },
    ]);
  });
});

describe("edit — pure manifest transforms", () => {
  it("add appends a document to documents[]", () => {
    const m = add({ documents: [{ src: "a.svg" }] }, { src: "b.svg" });
    expect(m.documents?.map((d) => d.src)).toEqual(["a.svg", "b.svg"]);
  });

  it("add seeds documents[] when the manifest has none", () => {
    const m = add({}, { src: "a.svg" });
    expect(m.documents).toEqual([{ src: "a.svg" }]);
  });

  it("add carries id and a normalized layout onto the new entry", () => {
    const m = add(
      {},
      { src: "a.svg", id: "n_x1", layout: { x: 1, y: 2, z: NaN } }
    );
    expect(m.documents).toEqual([
      { src: "a.svg", id: "n_x1", layout: { x: 1, y: 2 } },
    ]);
  });

  it("add refuses to create a duplicate identity (id or src)", () => {
    // Same src → no-op.
    const bySrc = add({ documents: [{ src: "a.svg" }] }, { src: "a.svg" });
    expect(bySrc.documents).toEqual([{ src: "a.svg" }]);
    // Same explicit id → no-op even with a different src.
    const byId = add(
      { documents: [{ src: "a.svg", id: "dup" }] },
      { src: "b.svg", id: "dup" }
    );
    expect(byId.documents).toEqual([{ src: "a.svg", id: "dup" }]);
  });

  it("add with no usable src is a no-op", () => {
    const m = { documents: [{ src: "a.svg" }] };
    expect(add(m, { src: "" })).toBe(m);
  });

  it("remove drops the matching document by identity (id or src)", () => {
    const bySrc = remove(
      { documents: [{ src: "a.svg" }, { src: "b.svg" }] },
      "a.svg"
    );
    expect(bySrc.documents?.map((d) => d.src)).toEqual(["b.svg"]);
    const byId = remove(
      { documents: [{ src: "a.svg", id: "n1" }, { src: "b.svg" }] },
      "n1"
    );
    expect(byId.documents?.map((d) => d.src)).toEqual(["b.svg"]);
  });

  it("remove(absent key) leaves the manifest unchanged", () => {
    const m = { documents: [{ src: "a.svg" }] };
    expect(remove(m, "nope.svg")).toBe(m);
  });

  it("reorder keeps the document set unchanged; only order differs", () => {
    const before = {
      documents: [{ src: "a.svg" }, { src: "b.svg" }, { src: "c.svg" }],
    };
    const after = reorder(before, ["c.svg", "a.svg", "b.svg"]);
    expect(after.documents?.map((d) => d.src)).toEqual([
      "c.svg",
      "a.svg",
      "b.svg",
    ]);
    // Same multiset of identities, just permuted.
    expect(new Set(after.documents?.map((d) => d.src))).toEqual(
      new Set(before.documents.map((d) => d.src))
    );
  });

  it("reorder appends unnamed entries after named ones in original order", () => {
    const m = reorder(
      { documents: [{ src: "a.svg" }, { src: "b.svg" }, { src: "c.svg" }] },
      ["c.svg"]
    );
    expect(m.documents?.map((d) => d.src)).toEqual(["c.svg", "a.svg", "b.svg"]);
  });

  it("reorder ignores unknown and repeated keys; each document placed once", () => {
    const m = reorder({ documents: [{ src: "a.svg" }, { src: "b.svg" }] }, [
      "b.svg",
      "ghost.svg",
      "b.svg",
      "a.svg",
    ]);
    expect(m.documents?.map((d) => d.src)).toEqual(["b.svg", "a.svg"]);
  });

  it("setLayout sets placement on the matching document only", () => {
    const m = setLayout(
      { documents: [{ src: "a.svg" }, { src: "b.svg" }] },
      "b.svg",
      { x: 10, y: 20 }
    );
    expect(m.documents?.[0].layout).toBeUndefined();
    expect(m.documents?.[1].layout).toEqual({ x: 10, y: 20 });
  });

  it("setLayout(null) clears placement (drops the layout field)", () => {
    const m = setLayout(
      { documents: [{ src: "a.svg", layout: { x: 1, y: 2 } }] },
      "a.svg",
      null
    );
    expect(m.documents?.[0]).toEqual({ src: "a.svg" });
    expect("layout" in (m.documents![0] as object)).toBe(false);
  });

  it("setLayout with an empty/non-finite layout clears placement", () => {
    const m = setLayout(
      { documents: [{ src: "a.svg", layout: { x: 1 } }] },
      "a.svg",
      { x: Infinity }
    );
    expect("layout" in (m.documents![0] as object)).toBe(false);
  });

  it("setLayout on an absent key is a no-op", () => {
    const m = { documents: [{ src: "a.svg" }] };
    expect(setLayout(m, "nope.svg", { x: 1 })).toBe(m);
  });

  it("setSkip marks a document skipped; false clears it (absent ⇒ not skipped)", () => {
    const set = setSkip(
      { documents: [{ src: "a.svg" }, { src: "b.svg" }] },
      "b.svg",
      true
    );
    expect(set.documents?.[0].skip).toBeUndefined();
    expect(set.documents?.[1].skip).toBe(true);
    // `false` drops the field entirely so the manifest stays minimal.
    const cleared = setSkip(set, "b.svg", false);
    expect("skip" in (cleared.documents![1] as object)).toBe(false);
  });

  it("setSkip on an absent key is a no-op", () => {
    const m = { documents: [{ src: "a.svg" }] };
    expect(setSkip(m, "nope.svg", true)).toBe(m);
  });

  it("add/remove/reorder/setLayout preserve the top-level unknown bag and ext", () => {
    const base: dotcanvas.Manifest = {
      type: "svg-slides",
      foo: "keep",
      ext: { vendor: { a: 1 } },
      documents: [{ src: "a.svg" }, { src: "b.svg", id: "n_b" }],
    };

    for (const result of [
      add(base, { src: "c.svg" }),
      remove(base, "a.svg"),
      reorder(base, ["b.svg", "a.svg"]),
      setLayout(base, "b.svg", { x: 1 }),
    ]) {
      expect(result.foo).toBe("keep");
      expect(result.ext).toEqual({ vendor: { a: 1 } });
    }
  });

  it("add/reorder/setLayout preserve unknown per-document fields (serialize round-trips)", () => {
    const base: dotcanvas.Manifest = {
      documents: [
        { src: "a.svg", name: "Intro", createdAt: 7 },
        { src: "b.svg", id: "n_b", note: { deep: true } },
      ],
    };
    // These three keep both documents, so both unknown bags must survive intact.
    for (const result of [
      add(base, { src: "c.svg" }),
      reorder(base, ["b.svg", "a.svg"]),
      setLayout(base, "b.svg", { x: 1 }),
    ]) {
      const parsed = JSON.parse(serialize(result)) as dotcanvas.Manifest;
      const a = parsed.documents!.find((d) => d.src === "a.svg")!;
      const b = parsed.documents!.find((d) => d.src === "b.svg")!;
      expect(a.name).toBe("Intro");
      expect(a.createdAt).toBe(7);
      expect(b.id).toBe("n_b");
      expect(b.note).toEqual({ deep: true });
    }
  });

  it("remove keeps the surviving document's unknown fields untouched", () => {
    const base: dotcanvas.Manifest = {
      documents: [
        { src: "a.svg", name: "Intro" },
        { src: "b.svg", id: "n_b", note: { deep: true } },
      ],
    };
    const parsed = JSON.parse(
      serialize(remove(base, "a.svg"))
    ) as dotcanvas.Manifest;
    expect(parsed.documents).toEqual([
      { src: "b.svg", id: "n_b", note: { deep: true } },
    ]);
  });

  it("transforms never mutate the input manifest", () => {
    const base: dotcanvas.Manifest = {
      documents: [{ src: "a.svg", layout: { x: 1 } }],
    };
    const snapshot = serialize(base);
    add(base, { src: "b.svg" });
    remove(base, "a.svg");
    reorder(base, ["a.svg"]);
    setLayout(base, "a.svg", null);
    expect(serialize(base)).toBe(snapshot);
  });

  it("a transform result still resolves with no duplicate_identity warning", () => {
    const m = add({ documents: [{ src: "a.svg" }] }, { src: "b.svg" });
    const c = resolve(m, ["a.svg", "b.svg"]);
    expect(c.warnings).toEqual([]);
    expect(c.documents.map((d) => d.src)).toEqual(["a.svg", "b.svg"]);
  });
});
