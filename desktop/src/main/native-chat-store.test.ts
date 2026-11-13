// GRIDA-SEC-004 — disposable profiles exercise the native chat store.
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NativeAgentChatLaunch } from "./native-agent-chat";
import type { IpcMainInvokeEvent, WebContents } from "electron";
import type { NativeEditorSvgText } from "@grida/desktop-bridge";
import { IPC_CHANNELS } from "../bridge/contract";
import { NativeChatIpc } from "./native-chat-ipc";
import { NativeDocumentFiles } from "./native-document-files";
import { NativeGatewayConnection } from "./native-gateway-connection";
import { WorkspaceFileWorkers } from "./workspace-file-worker";
import { NativeWorkspaceAgents } from "./native-workspace-agents";

const electron = vi.hoisted(() => ({ temp: "", userData: "", media: "" }));
vi.mock("electron", () => ({
  app: {
    once: () => {},
    getPath: (name: "temp" | "userData") => electron[name],
    hasSingleInstanceLock: () => true,
  },
}));
vi.mock("../env", () => ({ EDITOR_BASE_URL: "https://grida.co" }));
vi.mock("./media-root", () => ({
  DesktopMediaRoot: {
    current() {
      return electron.media;
    },
  },
}));

const nativeResources = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;
const supported = process.platform === "darwin" || process.platform === "linux";
const roots: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

async function fixture() {
  vi.resetModules();
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "grida-chat-store-")
  );
  roots.push(root);
  const child = (name: string) => {
    const directory = path.join(root, name);
    fs.mkdirSync(directory, { mode: 0o700 });
    return directory;
  };
  const agentData = child("agent");
  const cwd = child("workspace");
  electron.temp = child("temp");
  electron.userData = child("desktop");
  electron.media = child("media");
  vi.stubEnv("GRIDA_AGENT_USER_DATA", agentData);
  const nativeState = path.join(electron.userData, "chats");
  const marker = path.join(nativeState, "store.json");
  const launch: Omit<NativeAgentChatLaunch, "stateDirectory"> = {
    resourcesPath: child("missing-resources"),
    cwd,
    provider: "openai-compatible",
    endpoint: "http://127.0.0.1:1/v1",
    model: "fixture",
  };
  const { NativeChatStore } = await import("./native-chat-store");
  return {
    NativeChatStore,
    start: async (options = launch) =>
      (await NativeChatStore.prepareFresh()).startWorkspace("work", options),
    child,
    launch,
    nativeState,
    marker,
    agentData,
  };
}

describe.skipIf(!supported)("Native chat store", () => {
  it.runIf(Boolean(nativeResources))(
    "reopens an ordinary native chat after a temp-root change",
    async () => {
      const test = await fixture();
      const start = async () => {
        vi.resetModules();
        const { NativeChatStore } = await import("./native-chat-store");
        const store = await NativeChatStore.prepareOrdinary([test.agentData]);
        expect(store.protectedPaths).toEqual(
          expect.arrayContaining([electron.userData, test.agentData])
        );
        return store.startWorkspace("work", {
          ...test.launch,
          resourcesPath: nativeResources!,
        });
      };
      const first = await start();
      let sessionId: string;
      try {
        expect(path.dirname(first.stateDirectory)).toBe(
          path.join(test.nativeState, "workspaces")
        );
        expect((await first.chat.list()).sessionIds).toHaveLength(0);
        sessionId = (await first.chat.create()).id;
      } finally {
        await first.chat.close();
      }
      electron.temp = test.child("next-launch-temp");
      const reopened = await start();
      try {
        expect(await reopened.chat.load(sessionId)).toEqual({
          id: sessionId,
        });
      } finally {
        await reopened.chat.close();
      }
    }
  );

  it("refuses native state it did not create", async () => {
    const test = await fixture();
    fs.mkdirSync(test.nativeState, { mode: 0o700 });
    const foreign = path.join(test.nativeState, "foreign");
    fs.writeFileSync(foreign, "keep");
    await expect(test.start()).rejects.toThrow(
      "native_chat_store_unowned_state"
    );
    expect(fs.readFileSync(foreign, "utf8")).toBe("keep");
  });

  it("refuses a store recorded for other profile paths", async () => {
    const test = await fixture();
    await test.NativeChatStore.prepareFresh();
    expect(JSON.parse(fs.readFileSync(test.marker, "utf8"))).toEqual({
      version: 1,
      source: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    vi.stubEnv("GRIDA_AGENT_USER_DATA", test.child("other-agent"));
    vi.resetModules();
    const { NativeChatStore } = await import("./native-chat-store");
    await expect(NativeChatStore.prepareFresh()).rejects.toThrow(
      "native_chat_store_source_changed"
    );
  });

  it("refuses a store marker with fields it does not define", async () => {
    const test = await fixture();
    await test.NativeChatStore.prepareFresh();
    const recorded = JSON.parse(fs.readFileSync(test.marker, "utf8"));
    fs.writeFileSync(
      test.marker,
      JSON.stringify({ ...recorded, owner: "other" })
    );
    vi.resetModules();
    const { NativeChatStore } = await import("./native-chat-store");
    await expect(NativeChatStore.prepareFresh()).rejects.toThrow(
      "native_chat_store_state_unsafe"
    );
  });

  it("keeps the native store separate from credential custody", async () => {
    const test = await fixture();
    await expect(
      test.start({
        ...test.launch,
        credentialHome: test.nativeState,
      })
    ).rejects.toThrow("native_chat_store_state_overlap");
  });

  it.runIf(Boolean(nativeResources)).each(["isolated", "ordinary"] as const)(
    "persists %s selected SVG chat with a rootless native worker and live text reply",
    async (profile) => {
      const test = await fixture();
      const prepared =
        profile === "ordinary"
          ? await test.NativeChatStore.prepareOrdinary([test.agentData])
          : await test.NativeChatStore.prepareFresh();
      const selected = path.join(test.child("user-files"), "drawing.svg");
      const original = "<svg>Original</svg>";
      fs.writeFileSync(selected, original);
      const origin = "https://editor.fixture.invalid";
      const target = randomUUID();
      const offers: string[][] = [];
      const toolReplies: unknown[] = [];
      const connection = await NativeGatewayConnection.open({
        origin,
        account: {
          withGatewayGrant: async (_, accept) =>
            accept({
              token: "fixture.gateway.token",
              subject: "synthetic-user",
              organizationId: 12,
              expiresAt: Date.now() + 120_000,
              isCurrent: () => true,
            }),
        },
        network: {
          prepare: () => async (body) => {
            const request = JSON.parse(body.toString());
            offers.push(
              (request.tools ?? []).map(
                (tool: { function: { name: string } }) => tool.function.name
              )
            );
            const event = (delta: object, finish_reason: string | null) =>
              `data: ${JSON.stringify({ id: "fixture", choices: [{ index: 0, delta, finish_reason }] })}\n\n`;
            const tool = offers.length === 1;
            const delta = tool
              ? {
                  tool_calls: [
                    {
                      index: 0,
                      id: "replace",
                      type: "function",
                      function: {
                        name: "svg_replace_selected_text",
                        arguments: JSON.stringify({
                          revision: target,
                          text: "Changed",
                        }),
                      },
                    },
                  ],
                }
              : { content: "The selected text changed." };
            toolReplies.push(
              ...request.messages.filter(
                (message: { role: string }) => message.role === "tool"
              )
            );
            return new Response(
              event(delta, null) +
                event({}, tool ? "tool_calls" : "stop") +
                "data: [DONE]\n\n",
              { headers: { "content-type": "text/event-stream" } }
            );
          },
        },
      });
      const workers = new WorkspaceFileWorkers(nativeResources!);
      const receipts =
        profile === "ordinary"
          ? prepared.documentIdentitiesDirectory
          : path.join(electron.userData, "document-identities");
      const launch = {
        ...connection.launch("fixture"),
        resourcesPath: nativeResources!,
      };
      const owners = new NativeWorkspaceAgents(prepared, async () => ({
        launch,
      }));
      const files = new NativeDocumentFiles(
        [electron.userData],
        path.dirname(selected),
        workers,
        receipts
      );
      const docId = await files.register(selected);
      let current: WebContents | undefined;
      const ipc = new NativeChatIpc(
        origin,
        () => null,
        {
          admits: () => true,
          ensure: async () => {
            throw new Error("unexpected workspace");
          },
        },
        undefined,
        undefined,
        undefined,
        undefined,
        false,
        {
          identity: (sender, id, owner) => {
            if (sender !== current || id !== docId)
              throw new Error("unexpected document");
            return files.chatIdentity(id, owner);
          },
          current: (key) => owners.currentDocument(key),
          ensure: async (id, requireCurrent) => {
            await owners.open({ id, requireCurrent });
          },
          close: (key) => owners.closeDocument(key),
        }
      );
      const received = vi.fn<(request: NativeEditorSvgText.Request) => void>();
      const frame = {
        url: `${origin}/desktop/file?docId=${docId}`,
        send(
          channel: string,
          request: NativeEditorSvgText.Request & {
            attachmentId: string;
            callId: string;
          }
        ) {
          if (channel !== IPC_CHANNELS.NATIVE_CHAT_EDITOR_SVG_TEXT) return;
          received(request);
          void ipc
            .documentRequest(event, () =>
              ipc.replyEditorSvgText(
                event,
                request.attachmentId,
                request.callId,
                { kind: "applied", path: "/canvas.svg", saved: false }
              )
            )
            .catch(() => {});
        },
      };
      const contents = Object.assign(new EventEmitter(), {
        mainFrame: frame,
        isDestroyed: () => false,
        isLoadingMainFrame: () => false,
      });
      const event = {
        sender: contents,
        senderFrame: frame,
      } as unknown as IpcMainInvokeEvent;
      current = event.sender;
      const invoke = <T>(run: () => T) => ipc.documentRequest(event, run);
      try {
        await expect(invoke(() => ipc.status(event, true))).resolves.toBe(
          "native-ready"
        );
        const attachment = await invoke(() => ipc.create(event));
        const scoped = {
          active: "/canvas.svg",
          open: ["/canvas.svg"],
          truncated: false,
        };
        await expect(
          invoke(() =>
            ipc.publishEditorSurfaces(event, attachment.attachmentId, {
              ...scoped,
              open: ["/canvas.svg", "/sibling.svg"],
            })
          )
        ).rejects.toThrow("native_chat_editor_surfaces_invalid");
        await expect(
          invoke(() =>
            ipc.publishEditorSurfaces(event, attachment.attachmentId, scoped, 1)
          )
        ).rejects.toThrow("native_chat_editor_surfaces_invalid");
        await invoke(() =>
          ipc.publishEditorSurfaces(event, attachment.attachmentId, scoped)
        );
        await invoke(() =>
          ipc.submit(
            event,
            attachment.attachmentId,
            "fixture-selected-svg",
            "Change the selected text.",
            "act",
            undefined,
            target
          )
        );
        await vi.waitFor(
          async () => {
            const { snapshot } = await invoke(() =>
              ipc.observe(event, attachment.attachmentId)
            );
            expect(snapshot.latest?.status).toBe("succeeded");
          },
          { timeout: 6000 }
        );
        expect(received).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({
            operation: { kind: "replace", revision: target, text: "Changed" },
          })
        );
        expect(toolReplies).toEqual([
          expect.objectContaining({
            content: expect.stringContaining('"saved":false'),
          }),
        ]);
        expect(offers[0]).toEqual(
          expect.arrayContaining([
            "svg_replace_selected_text",
            "svg_read_selected_text",
            "surface_list_open",
          ])
        );
        for (const offer of offers)
          for (const denied of [
            "read_file",
            "list_files",
            "search_text",
            "run_command",
            "surface_open",
            "spawn_agent",
          ])
            expect(offer).not.toContain(denied);
        expect(fs.readFileSync(selected, "utf8")).toBe(original);
        const key = await files.chatIdentity(docId, {
          signal: new AbortController().signal,
          check() {},
        });
        const context = path.join(
          test.nativeState,
          "documents",
          key,
          "context"
        );
        expect(fs.statSync(context).mode & 0o777).toBe(0o700);
        expect(fs.readdirSync(context)).toEqual([]);
        contents.emit("did-start-navigation", { isMainFrame: true });
        await owners.closeDocument(key);
        expect(owners.currentDocument(key)).toBeNull();
        await expect(invoke(() => ipc.status(event, true))).resolves.toBe(
          "native-ready"
        );
        const reopened = await invoke(() =>
          ipc.load(event, attachment.sessionId)
        );
        expect(
          await invoke(() => ipc.transcript(event, reopened.attachmentId))
        ).not.toHaveLength(0);
        expect(offers).toHaveLength(2);
      } finally {
        await owners.close();
        connection.close();
        workers.close();
      }
    },
    15_000
  );

  it.runIf(Boolean(nativeResources))(
    "opens two private workspace stores under one prepared store",
    async () => {
      const test = await fixture();
      const prepared = await test.NativeChatStore.prepareFresh();
      const one = { ...test.launch, resourcesPath: nativeResources! };
      const two = { ...one, cwd: test.child("other-workspace") };
      const results = await Promise.allSettled([
        prepared.startWorkspace("one", one),
        prepared.startWorkspace("two", two),
      ]);
      try {
        const [first, second] = results.map((result) => {
          if (result.status === "rejected") throw result.reason;
          return result.value;
        });
        expect(first.stateDirectory).not.toBe(second.stateDirectory);
        const session = await first.chat.create();
        await expect(second.chat.load(session.id)).rejects.toThrow(
          "session_missing"
        );
      } finally {
        await Promise.all(
          results.map((result) =>
            result.status === "fulfilled"
              ? result.value.chat.close()
              : undefined
          )
        );
      }
    },
    15000
  );

  it.runIf(Boolean(nativeResources))(
    "shares workspace startup across windows and drains all retained ownership",
    async () => {
      const test = await fixture();
      const prepared = await test.NativeChatStore.prepareFresh();
      const workspace = { id: "work", root: test.launch.cwd };
      const release = vi.fn<() => void>();
      const launch = { ...test.launch, resourcesPath: nativeResources! };
      const prepare = vi.fn<
        () => Promise<{ launch: typeof launch; release: () => void }>
      >(async () => ({ launch, release }));
      const owners = new NativeWorkspaceAgents(prepared, prepare);
      let id: string;
      try {
        const first = owners.open(workspace);
        const second = owners.open(workspace);
        expect(owners.current(workspace.id)).toBeNull();
        const active = await first;
        expect(await second).toBe(active);
        expect(owners.current(workspace.id)).toBe(active);
        expect(prepare).toHaveBeenCalledTimes(1);
        await expect(
          owners.open({ ...workspace, root: test.child("other-root") })
        ).rejects.toThrow("native_workspace_root_changed");
        id = (await active.chat.create()).id;
      } finally {
        await owners.close();
      }
      expect(owners.current(workspace.id)).toBeNull();
      expect(release).toHaveBeenCalledTimes(1);
      await expect(owners.open(workspace)).rejects.toThrow(
        "native_workspace_closing"
      );
      const restarted = new NativeWorkspaceAgents(prepared, prepare);
      try {
        const active = await restarted.open(workspace);
        expect(await active.chat.load(id)).toEqual({ id });
      } finally {
        await restarted.close();
      }
      expect(release).toHaveBeenCalledTimes(2);
      const began = Promise.withResolvers<void>();
      const resolveLaunch = Promise.withResolvers<void>();
      const pending = new NativeWorkspaceAgents(prepared, async (_, signal) => {
        began.resolve();
        await resolveLaunch.promise;
        expect(signal.aborted).toBe(true);
        return { launch, release };
      });
      const result = pending.open(workspace);
      await began.promise;
      const drained = pending.close();
      resolveLaunch.resolve();
      await expect(result).rejects.toThrow("native_workspace_closing");
      await drained;
      expect(release).toHaveBeenCalledTimes(3);
    },
    15000
  );

  it.runIf(Boolean(nativeResources))(
    "reopens a disconnected workspace without redispatching interrupted work",
    async () => {
      const test = await fixture();
      const prepared = await test.NativeChatStore.prepareFresh();
      const workspace = { id: "work", root: test.launch.cwd };
      const resourcesPath = test.child("crash-resources");
      const executableDir = path.join(resourcesPath, "native-agent");
      fs.mkdirSync(executableDir, { mode: 0o700 });
      const original = path.join(
        nativeResources!,
        "native-agent",
        "grida-agent"
      );
      const pidFile = path.join(resourcesPath, "fixture.pid");
      const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
      fs.writeFileSync(
        path.join(executableDir, "grida-agent"),
        `#!/bin/sh\nprintf '%s' "$$" > ${quote(pidFile)}\nexec ${quote(original)} "$@"\n`,
        { mode: 0o700 }
      );
      const requested = Promise.withResolvers<void>();
      let attempts = 0;
      const release = vi.fn<() => void>();
      const owners = new NativeWorkspaceAgents(prepared, async () => ({
        launch: {
          ...test.launch,
          resourcesPath,
          providerNetwork: {
            prepare: () => async () => {
              attempts += 1;
              requested.resolve();
              return new Response(new ReadableStream(), {
                headers: { "content-type": "text/event-stream" },
              });
            },
          },
        },
        release,
      }));
      try {
        const first = await owners.open(workspace);
        const session = await first.chat.create();
        const accepted = await first.chat.submit(
          session,
          "crash-fixture",
          "Hold this attempt"
        );
        await requested.promise;
        const pid = Number(fs.readFileSync(pidFile, "utf8"));
        expect(pid).toBeGreaterThan(1);
        process.kill(pid, "SIGKILL");
        await vi.waitFor(() => expect(owners.current(workspace.id)).toBeNull());
        const replacement = await owners.open(workspace);
        expect(replacement).not.toBe(first);
        expect(release).toHaveBeenCalledTimes(1);
        const reopened = await replacement.chat.load(session.id);
        expect(
          (await replacement.chat.observe(reopened)).current
        ).toMatchObject({
          turnId: accepted.turnId,
          disposition: "interrupted",
        });
        expect(attempts).toBe(1);
      } finally {
        await owners.close();
      }
      expect(release).toHaveBeenCalledTimes(2);
    },
    15_000
  );
});
