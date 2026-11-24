// GRIDA-SEC-004 — actual native SVG tools through one Main attachment.
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { IpcMainInvokeEvent } from "electron";
import type {
  NativeEditorSelection,
  NativeEditorSvgText,
} from "@grida/desktop-bridge";
import { expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "../bridge/contract";
import { NativeAgentChat } from "./native-agent-chat";
import { NativeChatIpc } from "./native-chat-ipc";
import { NativeGatewayConnection } from "./native-gateway-connection";

const resources = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;
const origin = "https://editor.fixture.invalid";
const SEARCH = "tool_search";
const READ = "svg_read_selected_text";
const REPLACE = "svg_replace_selected_text";
const INSPECT = "svg_inspect_selection";
const OPACITY = "svg_set_selection_opacity";

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
          if (offers.length === 1)
            return tool(
              SEARCH,
              { source: "workbench", query: "selected SVG text" },
              "svg-discover"
            );
          if (offers.length === 2) return tool(READ, {}, "svg-read");
          if (offers.length === 3)
            return tool(
              REPLACE,
              { revision: target, text: "Changed" },
              "svg-replace"
            );
          if (offers.length === 6)
            return tool(
              SEARCH,
              { source: "workbench", query: REPLACE },
              "svg-discover-again"
            );
          if (offers.length === 7)
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
      const deck = surface !== "workbench";
      const { ipc, url } = svgChatFixture(chat, cwd, surface);
      const frame = {
        url,
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
      expect(offers).toHaveLength(4);
      expect(offers[0]).toContain(SEARCH);
      expect(offers[0]).not.toContain(READ);
      expect(offers[0]).not.toContain(REPLACE);
      expect(offers[1]).toEqual(expect.arrayContaining([READ, REPLACE]));
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
              matches: expect.arrayContaining([
                expect.objectContaining({ kind: "tool", name: READ }),
                expect.objectContaining({ kind: "tool", name: REPLACE }),
              ]),
            },
          }),
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
      await vi.waitFor(() => expect(offers).toHaveLength(5));
      expect(offers[4]).not.toContain(SEARCH);
      expect(offers[4]).not.toContain(READ);
      expect(offers[4]).not.toContain(REPLACE);
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
      expect(offers).toHaveLength(7);
      expect(offers[5]).toContain(SEARCH);
      expect(offers[5]).not.toContain(READ);
      expect(offers[5]).not.toContain(REPLACE);
      expect(offers[6]).toContain(REPLACE);
      expect(delivered).toHaveLength(3);
      expect(delivered[2]).toMatchObject({
        attachmentId: unknown.attachmentId,
        targetId: target,
        operation: { kind: "replace", revision: target, text: "Unverified" },
      });
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

it.runIf(Boolean(resources)).each([
  {
    name: "legacy SVG",
    frame: "workbench",
    kind: "legacy",
    tab: "/poster.svg",
    path: "/poster.svg",
  },
  {
    name: "workbench slide",
    frame: "workbench",
    kind: "svg",
    tab: "/talk.canvas",
    path: "/talk.canvas/intro.svg",
  },
  {
    name: "root deck slide",
    frame: "root deck",
    kind: "svg",
    tab: "/poster.svg",
    path: "/poster.svg",
  },
  {
    name: "nested deck slide",
    frame: "nested deck",
    kind: "svg",
    tab: "/poster.svg",
    path: "/poster.svg",
  },
  {
    name: "workbench board",
    frame: "workbench",
    kind: "document",
    tab: "/art.canvas",
    path: "/art.canvas/hero.svg",
  },
  {
    name: "registered root board",
    frame: "root deck",
    kind: "document",
    tab: null,
    path: "/hero.svg",
  },
  {
    name: "registered nested board",
    frame: "nested deck",
    kind: "document",
    tab: null,
    path: "/hero.svg",
  },
] as const)(
  "dispatches one captured SVG selection through the built native catalog for $name",
  async ({ frame: route, kind, tab, path: pathInView }) => {
    const root = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "grida-svg-selection-")
    );
    const cwd = path.join(root, "workspace");
    await fs.mkdir(cwd, { mode: 0o700 });
    const targetId = randomUUID();
    const fileWindow = route !== "workbench";
    const placement = { boardPath: tab ?? "/", pinId: "hero" };
    const subject: NativeEditorSelection.Subject =
      kind === "document"
        ? { kind: "document", path: pathInView, placement }
        : { kind: "svg", path: pathInView };
    const targets =
      kind === "svg"
        ? [{ kind: "element", elementPath: [0], tag: "text" } as const]
        : [
            { kind: "element", elementPath: [0], tag: "rect" } as const,
            { kind: "element", elementPath: [1], tag: "g" } as const,
          ];
    const inspection: NativeEditorSelection.Inspection = {
      kind: "inspection",
      path: pathInView,
      revision: targetId,
      nextCursor: null,
      ...(kind === "document"
        ? {
            mode: "document",
            total: 1,
            targets: [
              { kind: "document", placement: { ...placement, layout: null } },
            ],
          }
        : { mode: "objects", total: targets.length, targets }),
    };
    const steps = [
      { name: INSPECT, action: { kind: "inspect" }, args: {} },
      ...(kind === "svg"
        ? [
            { name: READ, action: { kind: "read-text" }, args: {} },
            {
              name: REPLACE,
              action: {
                kind: "replace-text",
                revision: targetId,
                text: "Revised",
              },
              args: { revision: targetId, text: "Revised" },
            },
          ]
        : kind === "legacy"
          ? [
              {
                name: OPACITY,
                action: {
                  kind: "set-opacity",
                  revision: targetId,
                  opacity: 0.5,
                },
                args: { revision: targetId, opacity: 0.5 },
              },
            ]
          : []),
    ];
    const offered: string[][] = [];
    const toolResults: unknown[] = [];
    const delivered: NativeEditorSelection.Operation[] = [];
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
          offered.push(
            (request.tools ?? []).map(
              (item: { function: { name: string } }) => item.function.name
            )
          );
          toolResults.push(
            ...request.messages
              .filter((message: { role: string }) => message.role === "tool")
              .map((message: { content: string }) =>
                JSON.parse(message.content)
              )
          );
          if (offered.length === 1)
            return tool(SEARCH, { query: "SVG selection" }, "find-selection");
          const step = steps[offered.length - 2];
          if (step)
            return tool(step.name, step.args, `editor-${step.action.kind}`);
          return stream({ content: "The selection was handled." }, "stop");
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
      expect(chat.acceptsEditorToolContext).toBe(true);
      const { ipc, url } = svgChatFixture(chat, cwd, route);
      const frame = {
        url,
        send(
          channel: string,
          request: NativeEditorSelection.Request & {
            attachmentId: string;
            callId: string;
          }
        ) {
          if (channel !== IPC_CHANNELS.NATIVE_CHAT_EDITOR_SVG_SELECTION) return;
          expect(request.targetId).toBe(targetId);
          expect(request.path).toBe(pathInView);
          expect(request.subject).toEqual(subject);
          delivered.push(request.operation);
          const result: NativeEditorSelection.Result =
            request.operation.kind === "inspect"
              ? inspection
              : request.operation.kind === "read-text"
                ? {
                    kind: "text",
                    path: pathInView,
                    revision: targetId,
                    text: "Original",
                  }
                : { kind: "applied", path: pathInView, saved: false };
          void onRoute(() =>
            ipc.replyEditorSvgSelection(
              event,
              request.attachmentId,
              request.callId,
              result
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
        fileWindow ? await ipc.deckRequest(event, invoke) : await invoke();
      const attachment = await onRoute(() => ipc.create(event));
      const id = attachment.attachmentId;
      /* eslint-disable jest/no-conditional-expect -- Each surface has different supported operations. */
      if (!fileWindow && subject.kind === "document") {
        expect(() =>
          ipc.publishEditorSurfaces(event, id, {
            active: null,
            open: [],
            truncated: false,
            selection: {
              ...subject,
              placement: { boardPath: "/", pinId: "hero" },
            },
          })
        ).toThrow("native_chat_editor_surfaces_invalid");
      }
      await onRoute(() =>
        ipc.publishEditorSurfaces(event, id, {
          active: tab,
          open: tab ? [tab] : [],
          truncated: false,
          ...(kind !== "legacy" && { selection: subject }),
        })
      );
      const send = (capture?: string) =>
        onRoute(() =>
          ipc.submit(
            event,
            id,
            "selection-fixture",
            "Inspect this selection.",
            "act",
            undefined,
            undefined,
            undefined,
            undefined,
            capture && kind !== "legacy"
              ? { targetId: capture, subject }
              : capture
          )
        );
      const receipt = await send(targetId);
      await vi.waitFor(
        async () => {
          const { snapshot } = await onRoute(() => ipc.observe(event, id));
          expect(snapshot.latest).toMatchObject({
            turnId: receipt.turnId,
            status: "succeeded",
          });
        },
        { timeout: 6000 }
      );
      expect(offered).toHaveLength(steps.length + 2);
      expect(offered[0]).toContain(SEARCH);
      expect(offered[0]).not.toContain(INSPECT);
      expect(offered[0]).not.toContain(OPACITY);
      expect(offered[1]).toContain(INSPECT);
      if (kind === "document") expect(offered.flat()).not.toContain(OPACITY);
      else expect(offered[1]).toContain(OPACITY);
      const expectedOperations = steps.map(({ action }) => action);
      if (kind === "svg") {
        expect(offered[1]).toEqual(expect.arrayContaining([READ, REPLACE]));
        expect(toolResults).toContainEqual(
          expect.objectContaining({
            status: "succeeded",
            structured: {
              kind: "read",
              path: pathInView,
              revision: targetId,
              text: "Original",
            },
          })
        );
      } else {
        expect(offered.flat()).not.toContain(READ);
        expect(offered.flat()).not.toContain(REPLACE);
      }
      expect(delivered).toEqual(expectedOperations);
      expect(toolResults).toContainEqual(
        expect.objectContaining({
          status: "succeeded",
          structured: inspection,
        })
      );
      if (kind !== "document")
        expect(toolResults).toContainEqual(
          expect.objectContaining({
            status: "succeeded",
            structured: { kind: "applied", path: pathInView, saved: false },
          })
        );
      /* eslint-enable jest/no-conditional-expect */
      expect(
        (await onRoute(() => ipc.transcriptPage(event, id))).messages
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: "user",
            text: "Inspect this selection.",
            svgSelection: true,
          }),
        ])
      );
      await expect(send(targetId)).resolves.toMatchObject({
        inputId: receipt.inputId,
        turnId: receipt.turnId,
      });
      await expect(send(randomUUID())).rejects.toThrow(
        "submission_editor_tool_context_changed"
      );
      await expect(send()).rejects.toThrow(
        "submission_editor_tool_context_changed"
      );
      expect(delivered).toEqual(expectedOperations);
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

function svgChatFixture(chat: NativeAgentChat, cwd: string, surface: string) {
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
            launchProtected: grant.protected,
          }),
          current: () => active,
          ensure: async () => {},
          close: async () => {},
        }
      : undefined
  );
  const url = deck
    ? `${origin}/desktop/file?id=${project}${nested ? "&path=decks%2FLaunch.canvas" : ""}`
    : `${origin}/desktop/workspace?id=${project}`;
  return { ipc, url };
}

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
