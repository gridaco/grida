import { EventEmitter, once } from "node:events";
import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { IpcMainInvokeEvent, WebContents } from "electron";
import { expect, it, vi } from "vitest";
import { NativeAgentChat } from "./native-agent-chat";
import { NativeChatIpc, type ConfigurationReview } from "./native-chat-ipc";

const resources = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;
const canonicalResponses = "https://api.openai.com/v1";

function message(text: string, id: string) {
  return {
    type: "message",
    id,
    role: "assistant",
    status: "completed",
    content: [{ type: "output_text", text, annotations: [] }],
  };
}

it.runIf(Boolean(resources)).each([
  {
    name: "verified window with final exact input pressure",
    endpoint: canonicalResponses,
    model: "gpt-6.1-sol",
    inputTokens: 1_045_904,
    compact: true,
  },
  {
    name: "verified window below its output reservation",
    endpoint: canonicalResponses,
    model: "gpt-6.1-sol",
    inputTokens: 1_045_903,
    compact: false,
  },
  {
    name: "custom endpoint with the same model name",
    endpoint: "http://127.0.0.1:1/v1",
    model: "gpt-6.1-sol",
    inputTokens: 1_045_904,
    compact: false,
  },
  {
    name: "unknown model at the canonical endpoint",
    endpoint: canonicalResponses,
    model: "fixture-unknown",
    inputTokens: 1_045_904,
    compact: false,
  },
  {
    name: "canonical model without reported input usage",
    endpoint: canonicalResponses,
    model: "gpt-6.1-sol",
    inputTokens: undefined,
    compact: false,
  },
])(
  "uses only verified model-window pressure for $name",
  async ({ endpoint, model, inputTokens, compact }) => {
    const root = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), "grida-context-pressure-")
    );
    const cwd = path.join(root, "workspace");
    fs.mkdirSync(cwd, { mode: 0o700 });
    const generationTarget = `${endpoint}/responses`;
    const earlier = "Earlier fixture context. ".repeat(48);
    const prior = "Keep the recent fixture turn.";
    const summary = "Compacted older fixture context.";
    const dispatches: Array<{
      target: string;
      model: string;
      outputLimit: number;
      body: string;
    }> = [];
    let chat: NativeAgentChat | undefined;
    try {
      chat = await NativeAgentChat.start({
        resourcesPath: resources!,
        stateDirectory: path.join(root, "state"),
        cwd,
        provider: "responses",
        endpoint,
        model,
        providerNetwork: {
          prepare: (target) => async (body) => {
            if (target !== generationTarget)
              throw new Error("unexpected fixture destination");
            const text = body.toString();
            const request = JSON.parse(text);
            dispatches.push({
              target,
              model: request.model,
              outputLimit: request.max_output_tokens,
              body: text,
            });
            const isSummary = request.instructions.includes(
              "Summarize the supplied conversation"
            );
            const count = JSON.stringify(request.input.at(-1)).includes(prior)
              ? inputTokens
              : 20;
            const frames = [
              {
                type: "response.output_item.done",
                output_index: 0,
                item: message(
                  isSummary ? summary : "Retained answer.",
                  `fixture-${dispatches.length}`
                ),
              },
              {
                type: "response.completed",
                response: {
                  status: "completed",
                  usage: { input_tokens: count, output_tokens: 10 },
                },
              },
            ];
            return new Response(
              frames
                .map((frame) => `data: ${JSON.stringify(frame)}\n\n`)
                .join(""),
              { headers: { "content-type": "text/event-stream" } }
            );
          },
        },
      });
      const active = chat;
      const session = await active.create();
      for (const [id, text] of [
        ["older", earlier],
        ["recent", prior],
      ]) {
        const accepted = await active.submit(session, id, text);
        expect(accepted.disposition).toBe("claimed");
        await vi.waitFor(
          async () => {
            const snapshot = await active.observe(session);
            expect(snapshot.latest).toMatchObject({
              turnId: accepted.turnId,
              status: "succeeded",
            });
          },
          { timeout: 5000 }
        );
      }
      const accepted = await active.submit(
        session,
        "next",
        "Continue the fixture task."
      );
      expect(accepted.disposition).toBe(compact ? "queued" : "claimed");
      await vi.waitFor(
        async () => {
          const receipt = await active.inputReceipt(session, "next");
          const snapshot = await active.observe(session);
          expect(receipt.disposition).toBe("completed");
          expect(snapshot.latest).toMatchObject({
            turnId: receipt.turnId,
            status: "succeeded",
          });
        },
        { timeout: 5000 }
      );
      expect(dispatches).toHaveLength(compact ? 4 : 3);
      expect(
        dispatches.every(
          (item) => item.target === generationTarget && item.model === model
        )
      ).toBe(true);
      expect(dispatches[1].outputLimit).toBe(4096);
      const last = dispatches.at(-1)!.body;
      expect(last.includes(summary)).toBe(compact);
      expect(last.includes("Earlier fixture context.")).toBe(!compact);
      expect(last).toContain(prior);
      expect(last).toContain("Continue the fixture task.");
    } finally {
      try {
        await chat?.close();
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  },
  20_000
);

function tool(name: string, id: string, args: object) {
  return {
    type: "function_call",
    id: `fc_${id}`,
    call_id: id,
    name,
    arguments: JSON.stringify(args),
    status: "completed",
  };
}

async function syntheticResponses() {
  const wire: Array<{
    tools?: Array<{ name: string }>;
    input?: Array<{ type: string; call_id?: string; output?: string }>;
  }> = [];
  let counted = 0;
  const server = createServer((request, response) => {
    request.setEncoding("utf8");
    let body = "";
    request.on("data", (chunk: string) => {
      body += chunk;
    });
    request.on("end", () => {
      if (
        request.method === "POST" &&
        request.url === "/v1/responses/input_tokens"
      ) {
        counted += 1;
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({ object: "response.input_tokens", input_tokens: 100 })
        );
        return;
      }
      if (
        request.method !== "POST" ||
        request.url !== "/v1/responses" ||
        wire.length >= 4
      ) {
        response.writeHead(400).end();
        return;
      }
      const submitted = JSON.parse(body);
      wire.push(submitted);
      let item;
      if (wire.length === 1) item = message("Inspection only.", "ordinary");
      else if (wire.length === 2) item = tool("config_inspect", "inspect", {});
      else if (wire.length === 3) {
        const output = wire
          .at(-1)
          ?.input?.find(
            ({ type, call_id }) =>
              type === "function_call_output" && call_id === "inspect"
          )?.output;
        const inspected =
          output && JSON.parse(output).structured?.configuration;
        if (
          !inspected?.exact_input_counting ||
          !Array.isArray(inspected.file_revision)
        ) {
          response.writeHead(400).end();
          return;
        }
        item = tool("config_update", "update", {
          expected_file_revision: inspected.file_revision,
          change: { operation: "reset_context_max_input_tokens" },
        });
      } else
        item = message("Automatic applies to future messages.", "reviewed");
      const events = [
        { type: "response.output_item.done", output_index: 0, item },
        {
          type: "response.completed",
          response: {
            status: "completed",
            usage: { input_tokens: 100, output_tokens: 10 },
          },
        },
      ];
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end(
        events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")
      );
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("fixture_listener_unavailable");
  return {
    endpoint: `http://127.0.0.1:${address.port}/v1`,
    wire,
    counted: () => counted,
    close: async () => {
      const closed = once(server, "close");
      server.close();
      server.closeAllConnections();
      await closed;
    },
  };
}

it.runIf(!!resources && process.platform !== "win32")(
  "shares the native context service between a reviewed setting and an identified Act message",
  async () => {
    const root = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), "grida-context-setting-")
    );
    const cwd = path.join(root, "workspace");
    fs.mkdirSync(cwd, { mode: 0o700 });
    const fixture = await syntheticResponses();
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
    const confirm = vi.fn<
      (sender: WebContents, review: ConfigurationReview) => Promise<boolean>
    >(async () => true);
    let chat: NativeAgentChat | undefined;
    try {
      chat = await NativeAgentChat.start({
        resourcesPath: resources!,
        stateDirectory: path.join(root, "state"),
        cwd,
        provider: "responses",
        endpoint: fixture.endpoint,
        model: "gpt-5.4",
      });
      const active = { workspaceId: "workspace", chat };
      const ipc = new NativeChatIpc(
        origin,
        (candidate) => (candidate === sender ? active : null),
        undefined,
        confirm
      );
      const before = await ipc.contextLimit(event);
      expect(before).toEqual({
        reviewId: expect.any(String),
        limit: null,
        exactCounting: true,
        source: "active",
      });
      const set = await ipc.saveContextLimit(event, before.reviewId, 64000);
      expect(set).toEqual({ limit: 64000, disposition: "applied" });
      expect(await ipc.saveContextLimit(event, before.reviewId, 64000)).toEqual(
        set
      );
      expect(fixture.wire).toHaveLength(0);
      expect(fixture.counted()).toBe(0);
      const { attachmentId } = await ipc.create(event);
      const ordinary = await ipc.submit(
        event,
        attachmentId,
        randomUUID(),
        "Inspect the workspace default."
      );
      await vi.waitFor(async () => {
        const { snapshot } = await ipc.observe(event, attachmentId);
        expect(snapshot.latest).toMatchObject({
          turnId: ordinary.turnId,
          status: "succeeded",
        });
      });
      expect(fixture.wire[0]?.tools?.map(({ name }) => name)).toContain(
        "config_inspect"
      );
      expect(fixture.wire[0]?.tools?.map(({ name }) => name)).not.toContain(
        "config_update"
      );

      const message = {
        action: "submit",
        inputId: randomUUID(),
        text: "Use Automatic for future messages.",
      } as const;
      const accepted = await ipc.submitWithConfigurationReview(
        event,
        attachmentId,
        message
      );
      expect(
        await ipc.submitWithConfigurationReview(event, attachmentId, message)
      ).toEqual(accepted);
      await expect(
        ipc.submit(event, attachmentId, message.inputId, message.text)
      ).rejects.toThrow("submission_configuration_permission_changed");
      await vi.waitFor(
        async () => {
          const { snapshot } = await ipc.observe(event, attachmentId);
          expect(snapshot.latest).toMatchObject({
            turnId: accepted.turnId,
            status: "succeeded",
          });
        },
        { timeout: 10_000 }
      );
      expect(fixture.wire).toHaveLength(4);
      expect(fixture.wire[1]?.tools?.map(({ name }) => name)).toContain(
        "config_update"
      );
      expect(fixture.counted()).toBeGreaterThan(0);
      expect((await ipc.contextLimit(event)).limit).toBeNull();
      expect(confirm.mock.calls).toEqual([
        [sender, { kind: "limit", limit: 64000 }],
        [sender, { kind: "message", text: message.text }],
      ]);
    } finally {
      try {
        await chat?.close();
      } finally {
        await fixture.close();
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  },
  25_000
);
