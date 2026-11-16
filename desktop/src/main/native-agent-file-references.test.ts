import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { NativeAgentChat } from "./native-agent-chat";
import { NativeAgentProcess } from "./native-agent-process";

// GRIDA-SEC-004 — Main sends a reference only for the person's file, and only
// as a path with metadata.
const POSTER = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";

afterEach(() => vi.restoreAllMocks());

async function started(workspace = true) {
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "grida-reference-chat-")
  );
  const cwd = path.join(root, "workspace");
  const store = path.join(root, "grida-data");
  const downloads = path.join(root, "downloads");
  for (const directory of [cwd, store, downloads])
    fs.mkdirSync(directory, { mode: 0o700 });
  fs.writeFileSync(path.join(cwd, "brief.md"), "brief");
  fs.writeFileSync(path.join(downloads, "clip.mov"), "video bytes");
  fs.writeFileSync(path.join(store, "secret.json"), "secret");
  const sessionId = "reference-session";
  const request = vi.fn<
    (method: string, params?: Record<string, unknown>) => Promise<unknown>
  >(async (method, params) => {
    if (method === "session/new") return { sessionId };
    if (
      method === "_co.grida/session/submit" ||
      method === "_co.grida/session/enqueue"
    )
      return {
        sessionId,
        inputId: params?.inputId,
        inputPosition: 1,
        disposition: "queued",
        turnId: null,
      };
    throw new Error("unexpected_request");
  });
  const process = {
    connected: true,
    acceptsFileReference: true,
    request,
    close: async () => {},
  };
  vi.spyOn(NativeAgentProcess, "start").mockResolvedValueOnce(
    process as unknown as NativeAgentProcess
  );
  const client = await NativeAgentChat.start({
    resourcesPath: root,
    stateDirectory: path.join(root, "state"),
    cwd,
    endpoint: "http://127.0.0.1:1/v1",
    provider: "responses",
    model: "gpt-5.4",
    ...(workspace && {
      workspace: {
        id: "workspace",
        primary: { id: "project", name: "Project", path: cwd },
        additionalReadRoots: [],
        protectedPaths: [store],
      },
    }),
  });
  const session = await client.create();
  return {
    root,
    cwd,
    store,
    downloads,
    client,
    session,
    process,
    request,
    close: async () => {
      await client.close();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

const input = (filePath: string) => ({
  action: "submit",
  inputId: "reference",
  text: "Make a short cut of this.",
  path: filePath,
  mimeType: "video/quicktime",
  preview: { poster: POSTER, durationMs: 12_500, width: 1920, height: 1080 },
  operatingRegime: "act",
});

it("sends a file outside the workspace as a path with its facts, never its bytes", async () => {
  const test = await started();
  try {
    expect(test.client.acceptsFileReference).toBe(true);
    await test.client.submitFileReference(
      test.session,
      input(path.join(test.downloads, "clip.mov"))
    );
    const sent = test.request.mock.lastCall;
    expect(sent?.[0]).toBe("_co.grida/session/submit");
    expect(sent?.[1]).toEqual({
      sessionId: "reference-session",
      inputId: "reference",
      operatingRegime: "act",
      prompt: [
        { type: "text", text: "Make a short cut of this." },
        {
          type: "resource_link",
          name: "clip.mov",
          uri: `file://${path.join(test.downloads, "clip.mov")}`,
          size: 11,
          mimeType: "video/quicktime",
          _meta: {
            "co.grida/file-reference": {
              preview: {
                poster: POSTER,
                durationMs: 12_500,
                width: 1920,
                height: 1080,
              },
            },
          },
        },
      ],
    });
    expect(JSON.stringify(sent)).not.toContain("video bytes");
  } finally {
    await test.close();
  }
});

it("sends a reference whose preview is out of bounds without that preview", async () => {
  const test = await started();
  try {
    await test.client.submitFileReference(test.session, {
      ...input(path.join(test.downloads, "clip.mov")),
      preview: {
        poster: "data:text/html;base64,AA",
        durationMs: 8 * 24 * 60 * 60 * 1000,
        width: 20_000,
        height: 1080,
      },
    });
    const [method, params] = test.request.mock.lastCall ?? [];
    expect(method).toBe("_co.grida/session/submit");
    const link = (params as { prompt: Record<string, unknown>[] }).prompt[1];
    expect(link.name).toBe("clip.mov");
    expect(link._meta).toBeUndefined();
  } finally {
    await test.close();
  }
});

it("names a workspace file by its workspace path", async () => {
  const test = await started();
  try {
    await test.client.submitFileReference(test.session, {
      ...input(path.join(test.cwd, "brief.md")),
      mimeType: "text/markdown",
      preview: undefined,
    });
    const sent = test.request.mock.lastCall?.[1] as
      | { prompt: Record<string, unknown>[] }
      | undefined;
    const link = sent?.prompt[1];
    expect(link?._meta).toEqual({
      "co.grida/file-reference": { workspacePath: "brief.md" },
    });
  } finally {
    await test.close();
  }
});

it("submits and queues folder references without bytes, media facts or new access", async () => {
  const test = await started();
  try {
    for (const [action, folder] of [
      ["submit", test.cwd],
      ["enqueue", test.downloads],
    ] as const) {
      await test.client.submitFileReference(test.session, {
        ...input(folder),
        action,
        inputId: `folder-${action}`,
      });
      const [method, sent] = test.request.mock.lastCall!;
      expect(method).toBe(`_co.grida/session/${action}`);
      expect(sent).toEqual({
        sessionId: "reference-session",
        inputId: `folder-${action}`,
        operatingRegime: "act",
        prompt: [
          { type: "text", text: "Make a short cut of this." },
          {
            type: "resource_link",
            name: path.basename(folder),
            uri: `file://${folder}`,
            mimeType: "inode/directory",
          },
        ],
      });
      expect(JSON.stringify(sent)).not.toContain("video bytes");
    }
    const launch = vi.mocked(NativeAgentProcess.start).mock.calls[0]?.[0];
    expect(launch?.workspace?.additionalReadRoots).toEqual([]);
  } finally {
    await test.close();
  }
});

it("refuses protected stores, unknown fields and unnegotiated chats before sending", async () => {
  const test = await started();
  try {
    const before = test.request.mock.calls.length;
    await expect(
      test.client.submitFileReference(
        test.session,
        input(path.join(test.store, "secret.json"))
      )
    ).rejects.toThrow("native_chat_file_reference_protected");
    const alias = path.join(test.downloads, "store-alias");
    fs.symlinkSync(test.store, alias);
    for (const folder of [test.store, test.root, alias]) {
      await expect(
        test.client.submitFileReference(test.session, input(folder))
      ).rejects.toThrow("native_chat_file_reference_protected");
    }
    await expect(
      test.client.submitFileReference(test.session, {
        ...input(path.join(test.downloads, "clip.mov")),
        bytes: new ArrayBuffer(4),
      })
    ).rejects.toThrow("native_chat_invalid_protocol_value");
    test.process.acceptsFileReference = false;
    await expect(
      test.client.submitFileReference(
        test.session,
        input(path.join(test.downloads, "clip.mov"))
      )
    ).rejects.toThrow("native_chat_file_reference_unavailable");
    expect(test.request.mock.calls.length).toBe(before);
  } finally {
    await test.close();
  }
});

it("offers references only to a chat with a workspace permission profile", async () => {
  const test = await started(false);
  try {
    expect(test.client.acceptsFileReference).toBe(false);
  } finally {
    await test.close();
  }
});
