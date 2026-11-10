// GRIDA-SEC-004 — private Desktop scheduling through a built native process.
import { EventEmitter, once } from "node:events";
import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import type { IpcMainInvokeEvent, WebContents } from "electron";
import { expect, it, vi } from "vitest";
import { NativeAgentChat } from "./native-agent-chat";
import { NativeChatIpc } from "./native-chat-ipc";

const resourcesPath = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;
const reason = "Check the export";
const scheduledPrompt = "Inspect the export after the delay.";

function toolResults(request: string): string {
  const { messages } = JSON.parse(request) as {
    messages: { role: string; content: unknown }[];
  };
  return JSON.stringify(messages.filter(({ role }) => role === "tool"));
}

async function provider() {
  const requests: string[] = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const part of request) body += part;
    const index = requests.push(body);
    if (request.url !== "/v1/chat/completions" || index > 5) {
      response.writeHead(400).end();
      return;
    }
    const chunk = (delta: unknown, finish_reason: string | null = null) =>
      `data: ${JSON.stringify({
        id: `response-${index}`,
        choices: [{ index: 0, delta, finish_reason }],
      })}\n\n`;
    response.writeHead(200, { "content-type": "text/event-stream" });
    const schedule = index === 1 || index === 3;
    response.write(
      schedule
        ? chunk({
            role: "assistant",
            tool_calls: [
              {
                index: 0,
                id: `wakeup-${index}`,
                type: "function",
                function: {
                  name: "request_wakeup",
                  arguments: JSON.stringify({
                    delay_ms: 3500,
                    reason,
                    prompt: scheduledPrompt,
                  }),
                },
              },
            ],
          })
        : chunk({ role: "assistant", content: "Finished checking." })
    );
    response.end(
      chunk({}, schedule ? "tool_calls" : "stop") + "data: [DONE]\n\n"
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("fixture_listener_unavailable");
  return {
    endpoint: `http://127.0.0.1:${address.port}/v1`,
    requests,
    close: async () => {
      const closed = once(server, "close");
      server.close();
      server.closeAllConnections();
      await closed;
    },
  };
}

it.runIf(Boolean(resourcesPath))(
  "keeps scheduled check-in permission, cancellation, and restart recovery attached to the exact task",
  async () => {
    const root = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), "grida-wakeups-")
    );
    const cwd = path.join(root, "workspace");
    fs.mkdirSync(cwd, { mode: 0o700 });
    const endpoint = await provider();
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
    const start = async () => {
      chat = await NativeAgentChat.start({
        resourcesPath: resourcesPath!,
        stateDirectory: path.join(root, "state"),
        cwd,
        provider: "openai-compatible",
        endpoint: endpoint.endpoint,
        model: "fixture",
      });
      const active = { workspaceId: "workspace", chat };
      return new NativeChatIpc(origin, (candidate) =>
        candidate === sender ? active : null
      );
    };
    const suspended = (ipc: NativeChatIpc, attachmentId: string) =>
      vi.waitFor(async () => {
        const observed = await ipc.observe(event, attachmentId);
        expect(observed.snapshot.current?.disposition).toBe("suspended");
        return observed;
      });
    const finished = (
      ipc: NativeChatIpc,
      attachmentId: string,
      turnId: string
    ) =>
      vi.waitFor(async () => {
        const observed = await ipc.observe(event, attachmentId);
        expect(observed.snapshot.current).toBeNull();
        expect(observed.snapshot.latest).toMatchObject({
          turnId,
          status: "succeeded",
        });
        return observed;
      });
    try {
      let ipc = await start();
      expect(ipc.acceptsWakeups(event)).toBe(true);
      const first = await ipc.create(event);
      const firstInput = await ipc.submitWithWakeup(
        event,
        first.attachmentId,
        "cancel-task",
        "Schedule one check-in."
      );
      const firstWaiting = await suspended(ipc, first.attachmentId);
      expect(firstInput.turnId).toBe(firstWaiting.snapshot.current?.turnId);
      const waiting = await ipc.scheduledWakeup(
        event,
        first.attachmentId,
        firstWaiting.observationId
      );
      expect(waiting).toMatchObject({
        turnId: firstInput.turnId,
        reason,
        status: "waiting",
        armed: true,
      });
      expect(waiting?.dueAtMs).toBeGreaterThan(Date.now());
      expect(JSON.stringify(waiting)).not.toContain(scheduledPrompt);
      await expect(
        ipc.submitWithWakeup(
          event,
          first.attachmentId,
          "cancel-task",
          "Schedule one check-in."
        )
      ).resolves.toMatchObject({
        inputId: firstInput.inputId,
        turnId: firstInput.turnId,
      });
      expect(endpoint.requests).toHaveLength(1);
      await expect(
        ipc.controlWakeup(
          event,
          first.attachmentId,
          firstWaiting.observationId,
          waiting!.waitId,
          "cancel"
        )
      ).resolves.toMatchObject({ status: "cancelled", armed: false });
      const cancelled = await suspended(ipc, first.attachmentId);
      expect(cancelled.snapshot.current?.paused).toBe(false);
      expect(endpoint.requests).toHaveLength(1);
      const continuation = {
        action: "resume",
        requestId: "continue-task",
        observationId: cancelled.observationId,
        cancelledWakeupId: waiting!.waitId,
      };
      const resumed = await ipc.control(
        event,
        first.attachmentId,
        continuation
      );
      expect(resumed).toMatchObject({ turn: { turnId: firstInput.turnId } });
      const firstDone = await finished(
        ipc,
        first.attachmentId,
        firstInput.turnId!
      );
      await expect(
        ipc.control(event, first.attachmentId, continuation)
      ).resolves.toMatchObject({ turn: { turnId: firstInput.turnId } });
      expect(endpoint.requests).toHaveLength(2);
      expect(toolResults(endpoint.requests[1])).toContain("cancelled");
      expect(toolResults(endpoint.requests[1])).not.toContain(scheduledPrompt);
      await expect(
        ipc.scheduledWakeup(event, first.attachmentId, firstDone.observationId)
      ).resolves.toMatchObject({ status: "cancelled", armed: false });

      const second = await ipc.create(event);
      const secondInput = await ipc.submitWithWakeup(
        event,
        second.attachmentId,
        "restore-task",
        "Schedule another check-in."
      );
      const secondWaiting = await suspended(ipc, second.attachmentId);
      const retained = await ipc.scheduledWakeup(
        event,
        second.attachmentId,
        secondWaiting.observationId
      );
      expect(retained).toMatchObject({
        turnId: secondInput.turnId,
        status: "waiting",
        armed: true,
      });
      await ipc.control(event, second.attachmentId, {
        action: "pause",
        requestId: "hold-task",
        observationId: secondWaiting.observationId,
      });
      await chat!.close();
      ipc = await start();
      const reopened = await ipc.load(event, second.sessionId);
      const reopenedObservation = await suspended(ipc, reopened.attachmentId);
      expect(reopenedObservation.snapshot.current?.paused).toBe(true);
      const restore = await ipc.scheduledWakeup(
        event,
        reopened.attachmentId,
        reopenedObservation.observationId
      );
      expect(restore).toMatchObject({
        waitId: retained!.waitId,
        dueAtMs: retained!.dueAtMs,
        status: "paused",
        armed: false,
      });
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(0, retained!.dueAtMs - Date.now()) + 100)
      );
      expect(endpoint.requests).toHaveLength(3);
      await expect(
        ipc.controlWakeup(
          event,
          reopened.attachmentId,
          reopenedObservation.observationId,
          restore!.waitId,
          "recover"
        )
      ).resolves.toMatchObject({ status: "paused", armed: true });
      expect(endpoint.requests).toHaveLength(3);
      const held = await suspended(ipc, reopened.attachmentId);
      await ipc.control(event, reopened.attachmentId, {
        action: "resume",
        requestId: "resume-task",
        observationId: held.observationId,
      });
      const secondDone = await finished(
        ipc,
        reopened.attachmentId,
        secondInput.turnId!
      );
      expect(endpoint.requests).toHaveLength(4);
      expect(toolResults(endpoint.requests[3])).toContain(scheduledPrompt);
      await expect(
        ipc.scheduledWakeup(
          event,
          reopened.attachmentId,
          secondDone.observationId
        )
      ).resolves.toMatchObject({ status: "delivered", armed: false });

      const ordinary = await ipc.create(event);
      const plain = await ipc.submit(
        event,
        ordinary.attachmentId,
        "ordinary",
        "Check now."
      );
      await finished(ipc, ordinary.attachmentId, plain.turnId!);
      expect(endpoint.requests[4]).not.toContain('"name":"request_wakeup"');
    } finally {
      await chat?.close();
      await endpoint.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
  30_000
);
