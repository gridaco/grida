import { EventEmitter, once } from "node:events";
import fs from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import type { IpcMainInvokeEvent, WebContents } from "electron";
import { expect, it, vi } from "vitest";
import { NativeAgentChat } from "./native-agent-chat";
import { NativeChatIpc } from "./native-chat-ipc";

const packaged = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;

function chunk(id: number, delta: unknown, finish: string | null = null) {
  return `data: ${JSON.stringify({
    id: `response-${id}`,
    choices: [{ index: 0, delta, finish_reason: finish }],
  })}\n\n`;
}

async function provider() {
  const requests: string[] = [];
  let held: ServerResponse | undefined;
  const server = createServer((request, response) => {
    request.setEncoding("utf8");
    let body = "";
    request.on("data", (part: string) => {
      body += part;
    });
    request.on("end", () => {
      requests.push(body);
      const index = requests.length;
      if (request.url !== "/v1/chat/completions" || index > 4) {
        response.writeHead(400).end();
        return;
      }
      response.writeHead(200, { "content-type": "text/event-stream" });
      if (index === 1) {
        response.write(
          chunk(index, {
            role: "assistant",
            tool_calls: [
              {
                index: 0,
                id: "ask-edition",
                type: "function",
                function: {
                  name: "question_async",
                  arguments: JSON.stringify({
                    question: "Which edition?",
                    options: ["Screen", "Print"],
                  }),
                },
              },
            ],
          })
        );
        response.end(chunk(index, {}, "tool_calls") + "data: [DONE]\n\n");
      } else if (index === 2) {
        held = response;
        response.write(
          chunk(index, { role: "assistant", content: "Independent work." })
        );
      } else {
        response.write(
          chunk(index, {
            role: "assistant",
            content:
              index === 3 ? "Applied the choice." : "Finished the follow-up.",
          })
        );
        response.end(chunk(index, {}, "stop") + "data: [DONE]\n\n");
      }
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("fixture_listener_unavailable");
  return {
    endpoint: `http://127.0.0.1:${address.port}/v1`,
    requests,
    release: () => held?.end(chunk(2, {}, "stop") + "data: [DONE]\n\n"),
    close: async () => {
      const closed = once(server, "close");
      server.close();
      server.closeAllConnections();
      await closed;
    },
  };
}

it.runIf(Boolean(packaged))(
  "answers a native question during independent work and keeps a follow-up queued separately",
  async () => {
    const root = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), "grida-questions-")
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
    try {
      chat = await NativeAgentChat.start({
        resourcesPath: packaged!,
        stateDirectory: path.join(root, "state"),
        cwd,
        provider: "openai-compatible",
        endpoint: endpoint.endpoint,
        model: "fixture",
      });
      const active = { workspaceId: "workspace", chat };
      const ipc = new NativeChatIpc(origin, (candidate) =>
        candidate === sender ? active : null
      );
      const { attachmentId } = await ipc.create(event);
      const accepted = await ipc.submit(
        event,
        attachmentId,
        "request",
        "Prepare the document."
      );
      await vi.waitFor(() => expect(endpoint.requests).toHaveLength(2));
      const observation = await ipc.observe(event, attachmentId);
      expect(observation.snapshot.current?.disposition).toBe("running");
      const [old] = await ipc.questions(
        event,
        attachmentId,
        observation.observationId
      );
      expect(old).toEqual(
        expect.objectContaining({
          style: "nonblocking",
          question: "Which edition?",
          options: ["Screen", "Print"],
        })
      );

      const queued = await ipc.enqueue(
        event,
        attachmentId,
        "follow-up",
        "Check the page numbers."
      );
      expect(queued.disposition).toBe("queued");
      const afterQueue = await ipc.observe(event, attachmentId);
      expect(afterQueue.snapshot.queuedInputs).toBe(1);
      expect(afterQueue.snapshot.current?.turnId).toBe(accepted.turnId);
      const [question] = await ipc.questions(
        event,
        attachmentId,
        afterQueue.observationId
      );
      expect(question.questionId).toBe(old.questionId);
      expect(question.reviewId).not.toBe(old.reviewId);
      const choice = { kind: "choice", index: 1 } as const;
      await expect(
        ipc.answerQuestion(event, attachmentId, old.reviewId, choice)
      ).rejects.toThrow("stale_session_revision");
      const answer = await ipc.answerQuestion(
        event,
        attachmentId,
        question.reviewId,
        choice
      );
      expect(answer.turnId).toBe(accepted.turnId);
      expect(endpoint.requests).toHaveLength(2);
      endpoint.release();
      await vi.waitFor(() => expect(endpoint.requests).toHaveLength(4));
      await vi.waitFor(async () => {
        const receipt = await ipc.inputReceipt(
          event,
          attachmentId,
          "follow-up"
        );
        expect(receipt.disposition).toBe("completed");
      });
      expect(endpoint.requests[2]).toContain("Print");
      expect(endpoint.requests[2]).not.toContain("Check the page numbers.");
      expect(endpoint.requests[3]).toContain("Check the page numbers.");
      await expect(
        ipc.answerQuestion(event, attachmentId, question.reviewId, choice)
      ).resolves.toEqual(answer);
      await expect(
        ipc.answerQuestion(event, attachmentId, question.reviewId, {
          kind: "skipped",
        })
      ).rejects.toThrow("question_no_longer_answerable");
      sender.emit("did-start-navigation", { isMainFrame: true });
      await expect(
        ipc.answerQuestion(event, attachmentId, question.reviewId, choice)
      ).rejects.toThrow("native_chat_attachment_unavailable");
      expect(endpoint.requests).toHaveLength(4);
    } finally {
      try {
        await chat?.close();
      } finally {
        await endpoint.close();
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  },
  15_000
);
