import { randomUUID } from "node:crypto";
import { once } from "node:events";
import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { NativeAgentChat } from "./native-agent-chat";

const resources = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;

it.skipIf(!resources || process.platform === "win32")(
  "persists selection through real Main/native requests and restart without changing an accepted retry",
  async () => {
    const root = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), "grida-selection-seam-")
    );
    const cwd = path.join(root, "project");
    fs.mkdirSync(cwd, { mode: 0o700 });
    const requests: Record<string, unknown>[] = [];
    const server = createServer((request, response) => {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        requests.push(JSON.parse(body));
        response.writeHead(200, { "content-type": "text/event-stream" });
        const events = [
          {
            type: "response.output_item.done",
            output_index: 0,
            item: {
              type: "message",
              id: `reply-${requests.length}`,
              role: "assistant",
              status: "completed",
              content: [
                { type: "output_text", text: "Confirmed.", annotations: [] },
              ],
            },
          },
          {
            type: "response.completed",
            response: {
              status: "completed",
              usage: { input_tokens: 5, output_tokens: 2 },
            },
          },
        ];
        response.end(
          events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")
        );
      });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("fixture_bind");
    const start = () =>
      NativeAgentChat.start({
        resourcesPath: resources!,
        stateDirectory: path.join(root, "state"),
        cwd,
        provider: "responses",
        endpoint: `http://127.0.0.1:${address.port}/v1`,
        model: "gpt-6.1-sol",
        reasoning: true,
      });
    let chat: NativeAgentChat | undefined;
    const sessionId = randomUUID(),
      createId = randomUUID(),
      inputId = randomUUID();
    try {
      chat = await start();
      expect(chat.acceptsSelection).toBe(true);
      let session = await chat.createSelected({
        sessionId,
        requestId: createId,
        selection: { connectionId: null, model: "gpt-6.1-sol", effort: "high" },
      });
      expect(await chat.selectionRequest("inspect", sessionId)).toMatchObject({
        revision: 1,
        selection: { effort: "high" },
      });
      expect(requests).toHaveLength(0);
      const accepted = await chat.submit(
        session,
        inputId,
        "First request",
        "act",
        undefined,
        "high",
        1
      );
      await vi.waitFor(
        async () =>
          expect((await chat!.observe(session)).latest?.status).toBe(
            "succeeded"
          ),
        { timeout: 15_000 }
      );
      expect(requests).toHaveLength(1);
      expect(requests[0].model).toBe("gpt-6.1-sol");
      const operationId = randomUUID();
      await chat.selectionRequest("update", sessionId, {
        operationId,
        expectedRevision: 1,
        selection: { connectionId: null, model: "gpt-6.1-sol", effort: "low" },
      });
      await chat.selectionRequest("ack", sessionId, { operationId });
      expect(
        await chat.submit(
          session,
          inputId,
          "First request",
          "act",
          undefined,
          "high",
          1
        )
      ).toEqual({ ...accepted, disposition: "completed" });
      await expect(
        chat.submit(
          session,
          randomUUID(),
          "Stale request",
          "act",
          undefined,
          "high",
          1
        )
      ).rejects.toThrow("selection_revision_changed");
      expect(requests).toHaveLength(1);
      await chat.close();
      chat = await start();
      session = await chat.load(sessionId);
      expect(await chat.selectionRequest("inspect", sessionId)).toMatchObject({
        revision: 2,
        selection: { effort: "low" },
      });
      expect(requests).toHaveLength(1);
      await chat.submit(
        session,
        randomUUID(),
        "Second request",
        "act",
        undefined,
        "low",
        2
      );
      await vi.waitFor(
        async () => {
          expect(requests).toHaveLength(2);
          expect((await chat!.observe(session)).latest?.status).toBe(
            "succeeded"
          );
        },
        { timeout: 15_000 }
      );
    } finally {
      await chat?.close();
      server.close();
      await once(server, "close");
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
  45_000
);
