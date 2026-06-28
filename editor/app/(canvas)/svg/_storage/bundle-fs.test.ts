import { describe, expect, it } from "vitest";
import { AgentFs } from "@grida/agent/fs";
import { dotcanvas } from "dotcanvas";
import { bundleFs, ManifestHidingBackend } from "./bundle-fs";

// The seam between SvgDocStore and `dotcanvas`: the store persists a
// `.canvas` bundle (.canvas.json + <id>.svg) over an `AgentFs.Backend`, reads
// the manifest through `bundleFs`, and exposes the SVG documents to the AI
// copilot through `ManifestHidingBackend` (which must keep .canvas.json out of
// sight). These pin that boundary without a browser.

const APP_EXT_KEY = "co.grida.svg-demo";

describe("bundleFs — dotcanvas path adapter", () => {
  it("translates dotcanvas's bare paths to the backend's leading-slash convention", async () => {
    const backend = new AgentFs.MemoryBackend();
    // dotcanvas writes `.canvas.json` (no leading slash); the backend stores it
    // leading-slash, as a sibling of the leading-slash document files.
    await dotcanvas.write(bundleFs(backend), { editor: "slides" });
    expect(await backend.read("/.canvas.json")).not.toBeNull();
    expect(await dotcanvas.read(bundleFs(backend)).then((c) => c.editor)).toBe(
      "slides"
    );
  });
});

describe("ManifestHidingBackend — copilot view", () => {
  it("hides .canvas.json from list/read and drops writes to it", async () => {
    const backend = new AgentFs.MemoryBackend();
    await backend.write("/001.svg", "<svg/>");
    await dotcanvas.write(bundleFs(backend), { editor: "slides" });

    const hidden = new ManifestHidingBackend(backend);
    expect(await hidden.list()).toEqual(["/001.svg"]); // no /.canvas.json
    expect(await hidden.read("/.canvas.json")).toBeNull();

    await hidden.write("/.canvas.json", "tampered");
    // The real manifest is untouched — the agent can't clobber it.
    expect(await backend.read("/.canvas.json")).not.toBe("tampered");
  });

  it("passes SVG documents through untouched", async () => {
    const backend = new AgentFs.MemoryBackend();
    const hidden = new ManifestHidingBackend(backend);
    await hidden.write("/a.svg", "<svg id='a'/>");
    expect(await hidden.read("/a.svg")).toBe("<svg id='a'/>");
    expect(await backend.read("/a.svg")).toBe("<svg id='a'/>");
  });
});

describe("manifest round-trip (store ↔ dotcanvas)", () => {
  it("preserves order, per-doc name/createdAt, and the activeId in ext", async () => {
    const backend = new AgentFs.MemoryBackend();
    await backend.write("/a.svg", "<svg/>");
    await backend.write("/b.svg", "<svg/>");

    // Shaped exactly as SvgDocStore.buildManifest() does.
    const manifest: dotcanvas.Manifest = {
      editor: "slides",
      documents: [
        { src: "b.svg", id: "b", name: "Second", createdAt: 1 },
        { src: "a.svg", id: "a", name: "First", createdAt: 2 },
      ],
      ext: { [APP_EXT_KEY]: { activeId: "b" } },
    };
    await dotcanvas.write(bundleFs(backend), manifest);

    const c = await dotcanvas.read(bundleFs(backend));
    // Manifest is authoritative for order: b before a, both origin manifest.
    expect(c.documents.map((d) => d.src)).toEqual(["b.svg", "a.svg"]);
    expect(c.documents.every((d) => d.origin === "manifest")).toBe(true);
    // Per-doc unknown fields survive on the carried manifest.
    const byId = new Map(c.manifest?.documents?.map((d) => [d.id, d]));
    expect(byId.get("b")?.name).toBe("Second");
    expect(byId.get("b")?.createdAt).toBe(1);
    // View-state rides in ext.
    expect((c.ext[APP_EXT_KEY] as { activeId?: string }).activeId).toBe("b");
  });

  it("derives the deck from disk when .canvas.json is absent (fresh bundle)", async () => {
    const backend = new AgentFs.MemoryBackend();
    await backend.write("/010.svg", "<svg/>");
    await backend.write("/001.svg", "<svg/>");

    const c = await dotcanvas.read(bundleFs(backend));
    expect(c.mode).toBe("implicit");
    expect(c.documents.map((d) => d.src)).toEqual(["001.svg", "010.svg"]);
  });
});
