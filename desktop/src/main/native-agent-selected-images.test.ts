// GRIDA-SEC-004 — the native adapter receives an immutable original, never UI preview bytes.
import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { NativeAgentChat } from "./native-agent-chat";
import { NativeAgentProcess } from "./native-agent-process";
import type { NativeSelectedImages } from "./native-selected-images";
import { SelectedImageRequest } from "../bridge/selected-image-request";

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))
  );
});

async function fixture() {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "grida-selected-adapter-"))
  );
  roots.push(root);
  const cwd = path.join(root, "workspace"),
    stateDirectory = path.join(root, "state");
  await fs.mkdir(cwd, { mode: 0o700 });
  const captures: Array<{ body: Record<string, unknown>; pixels: Buffer }> = [];
  let fail: string | undefined;
  const process = {
    connected: true,
    acceptsSelectedImage: true,
    supportsSelectedImage: true,
    acceptsSelection: true,
    acceptsEffort: true,
    acceptsFileReference: true,
    close: vi.fn<() => Promise<void>>(async () => {}),
    request: vi.fn<
      (method: string, body: Record<string, unknown>) => Promise<unknown>
    >(
      async (
        method: string,
        body: Record<string, unknown>
      ): Promise<unknown> => {
        if (method === "session/new") return { sessionId: "chat" };
        if (
          method !== "_co.grida/session/submit" &&
          method !== "_co.grida/session/enqueue"
        )
          throw new Error("unexpected_rpc");
        const image = body.selectedImage as NativeSelectedImages.Descriptor;
        captures.push({
          body: structuredClone(body),
          pixels: await fs.readFile(image.path),
        });
        if (fail) {
          const code = fail;
          fail = undefined;
          throw new Error(code);
        }
        return {
          sessionId: body.sessionId,
          inputId: body.inputId,
          inputPosition: 1,
          turnId: null,
          disposition: "queued",
        };
      }
    ),
  };
  vi.spyOn(NativeAgentProcess, "start").mockResolvedValue(
    process as unknown as NativeAgentProcess
  );
  const start = (
    options: { workspace?: false; protectedPaths?: readonly string[] } = {}
  ) =>
    NativeAgentChat.start({
      resourcesPath: root,
      cwd,
      stateDirectory,
      provider: "responses",
      endpoint: "https://fixture.invalid/v1",
      model: "fixture",
      ...(options.protectedPaths !== undefined && {
        protectedPaths: options.protectedPaths,
      }),
      ...(options.workspace !== false && {
        workspace: {
          id: "workspace",
          primary: { id: "workspace", name: "Workspace", path: cwd },
          additionalReadRoots: [],
          protectedPaths: [stateDirectory],
        },
      }),
    });
  const input = {
    action: "submit",
    inputId: "input",
    text: "Describe the original",
    name: "original.jpg",
    bytes: new TextEncoder().encode("original-image-not-display-poster").buffer,
    operatingRegime: "act",
    selectionRevision: 7,
  };
  return {
    root,
    stateDirectory,
    cwd,
    process,
    captures,
    start,
    input,
    fail: (code: string) => {
      fail = code;
    },
  };
}

describe("NativeAgentChat selected-image adapter", () => {
  it("supports protected original image custody in a rootless fixed context without granting file references", async () => {
    const f = await fixture();
    const chat = await f.start({
      workspace: false,
      protectedPaths: [f.stateDirectory],
    });
    const session = await chat.create();
    try {
      expect(chat.supportsSelectedImage).toBe(true);
      expect(chat.acceptsSelectedImage).toBe(true);
      expect(chat.acceptsFileReference).toBe(false);
      expect(NativeAgentProcess.start).toHaveBeenCalledExactlyOnceWith(
        expect.not.objectContaining({ protectedPaths: expect.anything() })
      );
      expect(
        vi.mocked(NativeAgentProcess.start).mock.calls[0][0]
      ).not.toHaveProperty("workspace");
      await chat.submitSelectedImage(session, f.input);
      const image = f.captures[0].body
        .selectedImage as NativeSelectedImages.Descriptor;
      expect(image.source).toBe("snapshot");
      expect(path.dirname(image.path)).toBe(
        path.join(f.stateDirectory, "desktop-image-custody", "snapshots")
      );
      expect(f.captures[0].pixels).toEqual(Buffer.from(f.input.bytes));
      const protectedSource = path.join(f.stateDirectory, "private.jpg");
      await fs.writeFile(protectedSource, Buffer.from(f.input.bytes));
      await expect(
        chat.submitSelectedImage(session, {
          ...f.input,
          inputId: "private-disk",
          name: "private.jpg",
          bytes: undefined,
          path: protectedSource,
          sha256: [
            ...createHash("sha256").update(Buffer.from(f.input.bytes)).digest(),
          ],
          size: f.input.bytes.byteLength,
          lastModified: Math.trunc((await fs.stat(protectedSource)).mtimeMs),
        })
      ).rejects.toThrow("selected_image_protected");
      expect(f.captures).toHaveLength(1);
    } finally {
      await chat.close();
    }
  });

  it("withholds new image custody for raw rootless launches with unknown private roots", async () => {
    const f = await fixture(),
      chat = await f.start({ workspace: false });
    try {
      expect(chat.supportsSelectedImage).toBe(false);
      expect(chat.acceptsSelectedImage).toBe(false);
      const session = await chat.create();
      await expect(chat.submitSelectedImage(session, f.input)).rejects.toThrow(
        "image_input_unavailable"
      );
      expect(f.captures).toEqual([]);
      await expect(
        fs.stat(path.join(f.stateDirectory, "desktop-image-custody"))
      ).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await chat.close();
    }
  });

  it("rejects a replaced disk source before the first native request while keeping the frozen File intact", async () => {
    const f = await fixture();
    const disk = path.join(f.cwd, "original.jpg");
    const original = Buffer.from("selected-original-pixels");
    await fs.writeFile(disk, original);
    const lastModified = Math.trunc((await fs.stat(disk)).mtimeMs);
    const originalFile = new File([original], "original.jpg", {
      type: "image/jpeg",
      lastModified,
    });
    const file = new File(
      [await originalFile.arrayBuffer()],
      originalFile.name,
      { type: originalFile.type, lastModified }
    );
    await fs.writeFile(disk, Buffer.alloc(original.length, 9));
    await fs.utimes(disk, new Date(lastModified), new Date(lastModified));
    const input = await SelectedImageRequest.from(
      {
        action: "submit",
        inputId: "changed-before-send",
        text: "Describe",
        operatingRegime: "act",
        file,
        originalFile,
      },
      (origin) => (origin === originalFile ? disk : "")
    );
    const chat = await f.start(),
      session = await chat.create();
    try {
      await expect(chat.submitSelectedImage(session, input)).rejects.toThrow(
        "selected_image_changed"
      );
      expect(f.captures).toEqual([]);
      expect(Buffer.from(await file.arrayBuffer())).toEqual(original);
      expect(f.process.request).toHaveBeenCalledTimes(1);
    } finally {
      await chat.close();
    }
  });
  it("recovers the exact unknown snapshot attempt after reopen and cleans it only on verified acceptance", async () => {
    const f = await fixture();
    f.fail("native_agent_request_timeout");
    const first = await f.start(),
      session = await first.create();
    await expect(first.submitSelectedImage(session, f.input)).rejects.toThrow(
      "timeout"
    );
    const original = f.captures[0].body
      .selectedImage as NativeSelectedImages.Descriptor;
    expect(path.dirname(original.path)).toBe(
      path.join(f.stateDirectory, "desktop-image-custody", "snapshots")
    );
    expect(await fs.readFile(original.path)).toEqual(
      Buffer.from(f.input.bytes)
    );
    await first.close();
    const reopened = await f.start(),
      restored = await reopened.create();
    try {
      await expect(
        reopened.submitSelectedImage(restored, f.input)
      ).resolves.toMatchObject({ inputId: "input", disposition: "queued" });
      expect(f.captures[1]).toEqual(f.captures[0]);
      expect(f.captures[0].body).toMatchObject({
        prompt: [{ type: "text", text: f.input.text }],
        _meta: { "co.grida/selectionRevision": 7 },
        selectedImage: { name: "original.jpg", source: "snapshot" },
      });
      expect(original.sha256).toEqual([
        ...createHash("sha256").update(Buffer.from(f.input.bytes)).digest(),
      ]);
      await expect(fs.stat(original.path)).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await reopened.close();
    }
  });

  it("retires unknown snapshot custody when only the exact recovered receipt is read", async () => {
    const f = await fixture();
    f.fail("native_agent_request_timeout");
    const chat = await f.start(),
      session = await chat.create();
    try {
      await expect(chat.submitSelectedImage(session, f.input)).rejects.toThrow(
        "timeout"
      );
      const descriptor = f.captures[0].body
        .selectedImage as NativeSelectedImages.Descriptor;
      const request = f.process.request.getMockImplementation()!;
      f.process.request.mockImplementation(async (method, body) => {
        if (method === "_co.grida/session/input")
          return {
            receipt: {
              sessionId: "chat",
              inputId: f.input.inputId,
              inputPosition: 1,
              turnId: null,
              disposition: "queued",
            },
          };
        return request(method, body);
      });
      await expect(
        chat.inputReceipt(session, f.input.inputId)
      ).resolves.toMatchObject({ inputId: f.input.inputId });
      expect(f.captures).toHaveLength(1);
      await expect(fs.stat(descriptor.path)).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await chat.close();
    }
  });

  it("deletes a snapshot after an explicit pre-admission image refusal and retains the caller's input", async () => {
    const f = await fixture();
    f.fail("invalid_raster_image");
    const chat = await f.start(),
      session = await chat.create();
    try {
      await expect(chat.submitSelectedImage(session, f.input)).rejects.toThrow(
        "invalid_raster_image"
      );
      const image = f.captures[0].body
        .selectedImage as NativeSelectedImages.Descriptor;
      await expect(fs.stat(image.path)).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect(new TextDecoder().decode(f.input.bytes)).toBe(
        "original-image-not-display-poster"
      );
    } finally {
      await chat.close();
    }
  });

  it("refuses unsupported perception, stale option shapes and preview substitution before source custody", async () => {
    const f = await fixture();
    const chat = await f.start(),
      session = await chat.create();
    try {
      f.process.acceptsSelectedImage = false;
      await expect(chat.submitSelectedImage(session, f.input)).rejects.toThrow(
        "image_input_unavailable"
      );
      f.process.acceptsSelectedImage = true;
      await expect(
        chat.submitSelectedImage(session, { ...f.input, preview: "poster" })
      ).rejects.toThrow("invalid_protocol_value");
      await expect(
        chat.submitSelectedImage(session, { ...f.input, selectionRevision: -1 })
      ).rejects.toThrow("selection_invalid");
      expect(f.captures).toEqual([]);
      await expect(
        fs.stat(path.join(f.stateDirectory, "desktop-image-custody"))
      ).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await chat.close();
    }
  });
});
