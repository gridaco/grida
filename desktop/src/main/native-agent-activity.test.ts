// GRIDA-SEC-004 — actual packaged native child observation through Main admission.
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { IpcMainInvokeEvent, WebContents } from "electron";
import { expect, it, vi } from "vitest";
import { NativeAgentChat } from "./native-agent-chat";
import { NativeChatIpc } from "./native-chat-ipc";

const resources = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;
const encode = (value: unknown) =>
  new TextEncoder().encode(`data: ${JSON.stringify(value)}\n\n`);
const message = (text: string, id: string) => ({
  type: "message",
  id,
  role: "assistant",
  status: "completed",
  content: [{ type: "output_text", text, annotations: [] }],
});
function completed(text: string, id: string) {
  return [
    {
      type: "response.output_item.done",
      output_index: 0,
      item: message(text, id),
    },
    {
      type: "response.completed",
      response: {
        status: "completed",
        usage: { input_tokens: 5, output_tokens: 3 },
      },
    },
  ];
}

it.skipIf(!resources || process.platform === "win32")(
  "observes real child progress and retained conversation through Main without additional model work",
  async () => {
    const root = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), "grida-child-activity-seam-")
    );
    const cwd = path.join(root, "project");
    fs.mkdirSync(cwd, { mode: 0o700 });
    const endpoint = "https://provider.fixture.invalid/v1";
    const dispatched: Record<string, unknown>[] = [];
    let release: (() => void) | undefined;
    const start = () =>
      NativeAgentChat.start({
        resourcesPath: resources!,
        stateDirectory: path.join(root, "state"),
        cwd,
        provider: "responses",
        endpoint,
        model: "fixture-model",
        subagents: true,
        providerNetwork: {
          prepare: (target) => async (body) => {
            if (target !== `${endpoint}/responses`)
              throw new Error("fixture_destination");
            dispatched.push(JSON.parse(body.toString()));
            if (dispatched.length !== 2)
              return new Response(
                completed("Parent completed.", "parent-answer")
                  .map((frame) => new TextDecoder().decode(encode(frame)))
                  .join(""),
                { headers: { "content-type": "text/event-stream" } }
              );
            return new Response(
              new ReadableStream<Uint8Array>({
                start(controller) {
                  controller.enqueue(
                    encode({
                      type: "response.output_item.added",
                      output_index: 0,
                      item: {
                        ...message("", "child-answer"),
                        status: "in_progress",
                      },
                    })
                  );
                  controller.enqueue(
                    encode({
                      type: "response.output_text.delta",
                      output_index: 0,
                      item_id: "child-answer",
                      content_index: 0,
                      delta: "Actual live child text.",
                    })
                  );
                  release = () => {
                    release = undefined;
                    for (const frame of completed(
                      "Actual live child text. Finished review.",
                      "child-answer"
                    ))
                      controller.enqueue(encode(frame));
                    controller.close();
                  };
                },
              }),
              { headers: { "content-type": "text/event-stream" } }
            );
          },
        },
      });
    const origin = "https://editor.fixture.invalid";
    const frame = { url: `${origin}/desktop/workspace?id=workspace` };
    const sender = Object.assign(new EventEmitter(), {
      mainFrame: frame,
      isDestroyed: () => false,
      isLoadingMainFrame: () => false,
    }) as unknown as WebContents;
    const event = {
      sender,
      senderFrame: frame,
    } as unknown as IpcMainInvokeEvent;
    let chat: NativeAgentChat | undefined;
    let ipc: NativeChatIpc | undefined;
    try {
      chat = await start();
      const active = { workspaceId: "workspace", chat };
      ipc = new NativeChatIpc(origin, (candidate) =>
        candidate === sender ? active : null
      );
      const opened = await ipc.create(event);
      const id = opened.attachmentId;
      await ipc.submit(
        event,
        id,
        randomUUID(),
        "Complete the parent task.",
        "act"
      );
      await vi.waitFor(
        async () =>
          expect((await ipc!.observe(event, id)).snapshot.latest?.status).toBe(
            "succeeded"
          ),
        { timeout: 15_000 }
      );
      const observed = await ipc.observe(event, id);
      expect(observed.snapshot.subagentActivityAvailable).toBe(true);
      const parentPage = await ipc.transcriptPage(event, id);
      const parentAnswer = parentPage.messages.find(
        (entry) => entry.text === "Parent completed."
      );
      expect(parentAnswer).toMatchObject({
        turnId: observed.snapshot.latest!.turnId,
        activityOrder: expect.any(Number),
      });
      expect(Number.isSafeInteger(parentAnswer?.activityOrder)).toBe(true);
      expect(parentAnswer!.activityOrder).toBeGreaterThan(0);
      expect(parentAnswer!.activityOrderIncomplete).toBeUndefined();
      expect(
        (await ipc.subagentActivity(event, id, undefined)).children
      ).toEqual([]);
      const child = await ipc.createSubagent(event, id, {
        requestId: randomUUID(),
        name: "Layout review",
        workTurns: 2,
      });
      expect(
        (await ipc.subagentActivity(event, id, undefined)).children
      ).toContainEqual(
        expect.objectContaining({ childId: child.childId, status: "ready" })
      );
      await ipc.assignSubagent(event, id, {
        childId: child.childId,
        parentObservationId: observed.observationId,
        inputId: randomUUID(),
        instructions: "Read this exact child assignment.",
      });
      await vi.waitFor(() => expect(dispatched).toHaveLength(2), {
        timeout: 15_000,
      });
      await vi.waitFor(
        async () => {
          const current = await ipc!.subagentConversation(
            event,
            id,
            child.childId,
            undefined
          );
          expect(
            current.messages.some(
              (entry) =>
                entry.text === "Actual live child text." && entry.live === true
            )
          ).toBe(true);
          const liveMessage = current.messages.find((entry) => entry.live);
          expect(liveMessage).toMatchObject({
            turnId: current.turns.at(-1)!.turnId,
            activityOrder: expect.any(Number),
          });
          expect(Number.isSafeInteger(liveMessage?.activityOrder)).toBe(true);
          expect(liveMessage!.activityOrder).toBeGreaterThan(0);
          expect(liveMessage!.activityOrderIncomplete).toBeUndefined();
          expect(current.execution).toEqual({
            model: "fixture-model",
            effort: null,
          });
        },
        { timeout: 15_000 }
      );
      const progressing = await ipc.subagentConversation(
        event,
        id,
        child.childId,
        undefined
      );
      const progressingId = progressing.messages.find(
        (entry) => entry.live
      )?.messageId;
      const childOrder = progressing.messages.find(
        (entry) => entry.live
      )?.activityOrder;
      const activity = await ipc.subagentActivity(event, id, undefined);
      expect(activity.children).toContainEqual(
        expect.objectContaining({
          childId: child.childId,
          name: "Layout review",
          status: "running",
          section: "active",
        })
      );
      expect(activity.events).toContainEqual(
        expect.objectContaining({
          childId: child.childId,
          kind: "started",
          parentTurnId: observed.snapshot.latest!.turnId,
        })
      );
      // This private assignment names an already settled parent turn. Reading
      // the event cannot allocate a new coordinate in that closed timeline.
      expect(activity.orderComplete).toBe(false);
      expect(
        activity.events.every((entry) => entry.activityOrder === undefined)
      ).toBe(true);
      expect(dispatched).toHaveLength(2);
      release!();
      await vi.waitFor(
        async () => {
          const current = await ipc!.subagentConversation(
            event,
            id,
            child.childId,
            undefined
          );
          expect(
            current.messages.some(
              (entry) =>
                entry.text === "Actual live child text. Finished review." &&
                !entry.live
            )
          ).toBe(true);
          expect(current.turns.at(-1)?.status).toBe("succeeded");
        },
        { timeout: 15_000 }
      );
      const settled = await ipc.subagentConversation(
        event,
        id,
        child.childId,
        undefined
      );
      expect(
        settled.messages.some((entry) => entry.messageId === progressingId)
      ).toBe(true);
      expect(
        settled.messages.find((entry) => entry.messageId === progressingId)
          ?.activityOrder
      ).toBe(childOrder);
      expect(
        settled.messages.some(
          (entry) => entry.text === "Read this exact child assignment."
        )
      ).toBe(true);
      await chat.selectionRequest("update", opened.sessionId, {
        expectedRevision: 0,
        operationId: randomUUID(),
        selection: { connectionId: null, model: "future-model", effort: "low" },
      });
      expect(
        (await ipc.subagentConversation(event, id, child.childId, undefined))
          .execution
      ).toEqual({ model: "fixture-model", effort: null });
      await ipc.subagentConversation(event, id, child.childId, undefined);
      expect(dispatched).toHaveLength(2);
      ipc.detach(event, id);
      await chat.close();
      chat = await start();
      active.chat = chat;
      ipc = new NativeChatIpc(origin, (candidate) =>
        candidate === sender ? active : null
      );
      const reopened = await ipc.load(event, opened.sessionId);
      const retained = await ipc.subagentConversation(
        event,
        reopened.attachmentId,
        child.childId,
        undefined
      );
      expect(retained.messages).toEqual(settled.messages);
      expect(retained.execution).toEqual(settled.execution);
      expect(retained.live.available).toBe(true);
      expect(retained.messages.some((entry) => entry.live)).toBe(false);
      const done = await ipc.subagentActivity(
        event,
        reopened.attachmentId,
        undefined
      );
      expect(done.counts).toEqual({ active: 0, done: 1, complete: true });
      expect(done.events.map((entry) => entry.kind)).toEqual([
        "started",
        "finished",
      ]);
      expect(done.orderComplete).toBe(false);
      expect(
        done.events.every((entry) => entry.activityOrder === undefined)
      ).toBe(true);
      expect(
        (await ipc.transcriptPage(event, reopened.attachmentId)).messages.find(
          (entry) => entry.messageId === parentAnswer!.messageId
        )?.activityOrder
      ).toBe(parentAnswer!.activityOrder);
      await expect(ipc.load(event, child.childId)).rejects.toThrow(
        "session_missing"
      );
      expect(dispatched).toHaveLength(2);
    } finally {
      release?.();
      sender.emit("destroyed");
      await chat?.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
  60_000
);
