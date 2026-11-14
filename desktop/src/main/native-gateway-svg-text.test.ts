// GRIDA-SEC-004 — actual native SVG tools through one Main attachment.
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { IpcMainInvokeEvent } from "electron";
import type { NativeEditorSvgText } from "@grida/desktop-bridge";
import { expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "../bridge/contract";
import { NativeAgentChat } from "./native-agent-chat";
import { NativeChatIpc } from "./native-chat-ipc";
import { NativeGatewayConnection } from "./native-gateway-connection";

const resources = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;
const origin = "https://editor.fixture.invalid";
const READ = "svg_read_selected_text";
const REPLACE = "svg_replace_selected_text";

it.runIf(Boolean(resources)).each(["workbench", "root deck", "nested deck"])(
  "correlates selected SVG text through the built native process in the %s",
  async (surface) => {
    const root = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "grida-gateway-svg-")
    );
    const cwd = path.join(root, "workspace");
    await fs.mkdir(cwd, { mode: 0o700 });
    const target = randomUUID();
    const offers: string[][] = [];
    const results: unknown[] = [];
    const delivered: (NativeEditorSvgText.Request & {
      attachmentId: string;
      callId: string;
    })[] = [];
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
          results.push(
            ...request.messages
              .filter((message: { role: string }) => message.role === "tool")
              .map((message: { content: string }) =>
                JSON.parse(message.content)
              )
          );
          if (offers.length === 1) return tool(READ, {}, "svg-read");
          if (offers.length === 2)
            return tool(
              REPLACE,
              { revision: target, text: "Changed" },
              "svg-replace"
            );
          if (offers.length === 5)
            return tool(
              REPLACE,
              { revision: target, text: "Unverified" },
              "svg-unverified"
            );
          return stream(
            { content: "The selected SVG text was updated in the editor." },
            "stop"
          );
        },
      },
    });
    let chat: NativeAgentChat | undefined;
    try {
      chat = await NativeAgentChat.start({
        ...connection.launch("fixture"),
        resourcesPath: resources!,
        stateDirectory: path.join(root, "state"),
        cwd,
      });
      const project = "eac20941e6a410aa";
      const deck = surface !== "workbench";
      const nested = surface === "nested deck";
      const workspaceId = nested ? "deck-fixture" : project;
      const identity = { device: "1", inode: "2", birthTimeNs: "3" };
      const active = { workspaceId, chat, directoryIdentity: identity };
      const grant = { workspaceId, root: cwd, identity, protected: [] };
      const ipc = new NativeChatIpc(
        origin,
        () => active,
        deck ? { admits: () => true, ensure: async () => {} } : undefined,
        undefined,
        undefined,
        undefined,
        async () => grant,
        false,
        undefined,
        nested
          ? {
              grant: async () => ({
                ...grant,
                parentWorkspaceId: project,
                parentIdentity: identity,
              }),
              current: () => active,
              ensure: async () => {},
              close: async () => {},
            }
          : undefined
      );
      const fileRoute = `${origin}/desktop/file?id=${project}`;
      const frame = {
        url: deck
          ? nested
            ? `${fileRoute}&path=decks%2FLaunch.canvas`
            : fileRoute
          : `${origin}/desktop/workspace?id=${project}`,
        send(channel: string, request: (typeof delivered)[number]) {
          if (channel !== IPC_CHANNELS.NATIVE_CHAT_EDITOR_SVG_TEXT) return;
          delivered.push(request);
          const reply: NativeEditorSvgText.Result =
            request.operation.kind === "read"
              ? {
                  kind: "read",
                  path: "/poster.svg",
                  revision: target,
                  text: "Original",
                }
              : { kind: "applied", path: "/poster.svg", saved: false };
          void onRoute(() =>
            ipc.replyEditorSvgText(
              event,
              request.attachmentId,
              request.callId,
              delivered.length === 3
                ? deck
                  ? { kind: "applied", path: "/other.svg", saved: false }
                  : { kind: "applied", path: "/poster.svg", saved: true }
                : reply
            )
          ).catch(() => {});
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
      const onRoute = async <T>(invoke: () => T) =>
        deck ? await ipc.deckRequest(event, invoke) : await invoke();
      const attachment = await onRoute(() => ipc.create(event));
      const snapshot = {
        active: "/poster.svg",
        open: ["/poster.svg"],
        truncated: false,
      };
      const deckOnlyError = deck ? "native_chat_editor_surfaces_invalid" : null;
      const outcome = (invoke: () => void) =>
        onRoute(invoke).then(
          () => null,
          (error: Error) => error.message
        );
      expect(
        await outcome(() =>
          ipc.publishEditorSurfaces(event, attachment.attachmentId, {
            ...snapshot,
            open: ["/poster.svg", "/other.svg"],
          })
        )
      ).toBe(deckOnlyError);
      expect(
        await outcome(() =>
          ipc.publishEditorSurfaces(event, attachment.attachmentId, snapshot, 1)
        )
      ).toBe(deckOnlyError);
      await onRoute(() =>
        ipc.publishEditorSurfaces(event, attachment.attachmentId, snapshot)
      );
      const submitted = await onRoute(() =>
        ipc.submit(
          event,
          attachment.attachmentId,
          "svg-fixture-input",
          "Change the selected text.",
          "act",
          undefined,
          target
        )
      );
      await vi.waitFor(
        async () => {
          const { snapshot } = await onRoute(() =>
            ipc.observe(event, attachment.attachmentId)
          );
          expect(snapshot.current).toBeNull();
          expect(snapshot.latest).toMatchObject({
            turnId: submitted.turnId,
            status: "succeeded",
          });
        },
        { timeout: 6000 }
      );
      expect(offers[0]).toEqual(expect.arrayContaining([READ, REPLACE]));
      expect(delivered).toHaveLength(2);
      expect(
        delivered.map(({ attachmentId, targetId, operation }) => ({
          attachmentId,
          targetId,
          operation,
        }))
      ).toEqual([
        {
          attachmentId: attachment.attachmentId,
          targetId: target,
          operation: { kind: "read" },
        },
        {
          attachmentId: attachment.attachmentId,
          targetId: target,
          operation: { kind: "replace", revision: target, text: "Changed" },
        },
      ]);
      expect(new Set(delivered.map((call) => call.callId)).size).toBe(2);
      expect(results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            status: "succeeded",
            structured: {
              kind: "read",
              path: "/poster.svg",
              revision: target,
              text: "Original",
            },
          }),
          expect.objectContaining({
            status: "succeeded",
            structured: { kind: "applied", path: "/poster.svg", saved: false },
          }),
        ])
      );
      const plan = await onRoute(() => ipc.create(event));
      await onRoute(() =>
        ipc.submit(
          event,
          plan.attachmentId,
          "svg-plan-input",
          "Plan a change.",
          "plan"
        )
      );
      await vi.waitFor(() => expect(offers).toHaveLength(4));
      expect(offers[3]).not.toContain(READ);
      expect(offers[3]).not.toContain(REPLACE);
      expect(delivered).toHaveLength(2);
      const unknown = await onRoute(() => ipc.create(event));
      await onRoute(() =>
        ipc.publishEditorSurfaces(event, unknown.attachmentId, snapshot)
      );
      const attempted = await onRoute(() =>
        ipc.submit(
          event,
          unknown.attachmentId,
          "svg-unverified-input",
          "Change selected text again.",
          "act",
          undefined,
          target
        )
      );
      await vi.waitFor(
        async () => {
          const { snapshot } = await onRoute(() =>
            ipc.observe(event, unknown.attachmentId)
          );
          expect(snapshot.current).toBeNull();
          expect(snapshot.latest).toMatchObject({
            turnId: attempted.turnId,
            status: "uncertain",
          });
        },
        { timeout: 6000 }
      );
      expect(offers).toHaveLength(5);
      expect(delivered).toHaveLength(3);
    } finally {
      try {
        await chat?.close();
      } finally {
        connection.close();
        await fs.rm(root, { recursive: true, force: true });
      }
    }
  },
  20_000
);

function tool(name: string, arguments_: object, id: string): Response {
  return stream(
    {
      tool_calls: [
        {
          index: 0,
          id,
          type: "function",
          function: { name, arguments: JSON.stringify(arguments_) },
        },
      ],
    },
    "tool_calls"
  );
}

function stream(delta: object, reason: string): Response {
  const event = (delta: object, finish_reason: string | null) =>
    `data: ${JSON.stringify({ id: "fixture", choices: [{ index: 0, delta, finish_reason }] })}\n\n`;
  return new Response(
    event(delta, null) + event({}, reason) + "data: [DONE]\n\n",
    { headers: { "content-type": "text/event-stream" } }
  );
}
