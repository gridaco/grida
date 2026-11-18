import { createHash } from "node:crypto";
import type { WebContents } from "electron";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceFsEntry } from "@grida/daemon";
import type { DesktopBrowserTools } from "./desktop-browser-tools";
import type { FxResolvedFile } from "./fx-viewer";
import { FxWorkspaceFiles } from "./fx-workspace-files";

const sender = {} as WebContents;
const pageId = "d3c61462-e5eb-4c40-9509-b1ca37507c72";
const requested = { pageId, reference: { subject: "fixture" } };
const workspaceId = "a".repeat(16);
const relativePath = "runs/static.bin";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yZSoAAAAASUVORK5CYII=",
  "base64"
);
const gif = Buffer.from(
  "R0lGODlhAQABAIAAAExpcUCAwCH5BAUAAAAALAAAAAABAAEAAAICTAEAOw==",
  "base64"
);
const webp = Buffer.from(
  "UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAdQwAIVuP+BiOh/AAA=",
  "base64"
);

function recordedImage(bytes: Buffer): FxResolvedFile {
  return {
    workspaceId,
    relativePath,
    artifact: {
      size: bytes.length,
      digest: createHash("sha256").update(bytes).digest("hex"),
      name: "badge['sun'].draw/image",
    },
  };
}

function setup(resolved: FxResolvedFile, bytes = png) {
  let live = true;
  const list = vi.fn<() => Promise<WorkspaceFsEntry[]>>(async () => []);
  const read = vi.fn<
    ConstructorParameters<typeof FxWorkspaceFiles>[1]["bytes"]
  >(async () => ({
    base64: bytes.toString("base64"),
    size: bytes.length,
    mtime: 0,
  }));
  const activate = vi.fn<DesktopBrowserTools["activateFxViewerFile"]>(
    async (_sender, id, _reference, opening, signal) => {
      if (id !== pageId) return "stale";
      if (!(await opening.authorize({} as never))) return "not_authorized";
      return (await opening.open(resolved, () => live, signal))
        ? "opened"
        : "unavailable";
    }
  );
  return {
    activate,
    list,
    read,
    retire: () => {
      live = false;
    },
    files: new FxWorkspaceFiles(
      { activateFxViewerFile: activate },
      { list, bytes: read }
    ),
  };
}

describe("FxWorkspaceFiles.prepare", () => {
  it("returns a fixed raster snapshot with the recorded digest and no native or workspace path", async () => {
    const resolved = recordedImage(png);
    const { files, read, activate } = setup(resolved);
    await expect(files.prepare(sender, requested)).resolves.toEqual({
      kind: "ready",
      file: {
        kind: "artifact",
        name: resolved.artifact!.name,
        digest: resolved.artifact!.digest,
        mimeType: "image/png",
        base64: png.toString("base64"),
      },
    });
    expect(activate).toHaveBeenCalledExactlyOnceWith(
      sender,
      pageId,
      requested.reference,
      expect.any(Object),
      expect.any(AbortSignal)
    );
    expect(read).toHaveBeenCalledExactlyOnceWith(
      workspaceId,
      relativePath,
      expect.any(AbortSignal)
    );
  });

  it("rejects same-size replacement bytes or a non-raster payload even when FX resolved it", async () => {
    const original = recordedImage(png);
    const replaced = Buffer.from(png);
    replaced[45] ^= 1;
    await expect(
      setup(original, replaced).files.prepare(sender, requested)
    ).resolves.toEqual({ kind: "unavailable" });
    const html = Buffer.from("<script>unexpected()</script>");
    await expect(
      setup(recordedImage(html), html).files.prepare(sender, requested)
    ).resolves.toEqual({ kind: "unavailable" });
  });

  it.each([
    { signature: "GIF", bytes: gif, offset: 0, mimeType: "image/gif" },
    { signature: "RIFF", bytes: webp, offset: 0, mimeType: "image/webp" },
    { signature: "WEBP", bytes: webp, offset: 8, mimeType: "image/webp" },
  ])(
    "compares the $signature signature without masking high bits",
    async ({ bytes, offset, mimeType }) => {
      await expect(
        setup(recordedImage(bytes), bytes).files.prepare(sender, requested)
      ).resolves.toMatchObject({ kind: "ready", file: { mimeType } });
      const altered = Buffer.from(bytes);
      altered[offset] |= 0x80;
      await expect(
        setup(recordedImage(altered), altered).files.prepare(sender, requested)
      ).resolves.toEqual({ kind: "unavailable" });
    }
  );

  it("publishes no bytes after the initiating document is no longer current", async () => {
    const { files, read, retire } = setup(recordedImage(png));
    read.mockImplementationOnce(async () => {
      retire();
      return { base64: png.toString("base64"), size: png.length, mtime: 0 };
    });
    await expect(files.prepare(sender, requested)).resolves.toEqual({
      kind: "unavailable",
    });
  });

  it("returns a workspace source path only for a live file in its existing authorized directory", async () => {
    const { files, list, read } = setup({
      workspaceId,
      relativePath,
      sourceMatch: "changed",
    });
    const entry = {
      name: "static.bin",
      rel_path: relativePath,
      kind: "file",
    } as const;
    list
      .mockResolvedValueOnce([{ ...entry, kind: "symlink" }])
      .mockResolvedValueOnce([entry]);
    await expect(files.prepare(sender, requested)).resolves.toEqual({
      kind: "unavailable",
    });
    await expect(files.prepare(sender, requested)).resolves.toEqual({
      kind: "ready",
      file: {
        kind: "source",
        relativePath,
        sourceMatch: "changed",
      },
    });
    expect(list).toHaveBeenCalledWith(
      workspaceId,
      "runs",
      expect.any(AbortSignal)
    );
    expect(read).not.toHaveBeenCalled();
  });
});
