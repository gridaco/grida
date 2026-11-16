import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { NativeAgentChat } from "./native-agent-chat";

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
