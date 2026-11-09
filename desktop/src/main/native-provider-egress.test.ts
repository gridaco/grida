// GRIDA-SEC-004 / GRIDA-SEC-014 — route and stream tests for the private pipe.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { NativeAgentProcess } from "./native-agent-process";
import {
  NativeProviderEgress,
  type NativeProviderNetwork,
} from "./native-provider-egress";
import { NativeProviderSelection } from "./native-provider-selection";

const endpoint = "http://127.0.0.1:1/v1";
const target = endpoint + "/chat/completions";
const id = "f78fb11f-4e95-4c02-a315-3bcfd15bc536";

function open(overrides: Record<string, unknown> = {}) {
  return {
    id,
    action: "open",
    target,
    headers: [
      ["accept", "text/event-stream"],
      ["content-type", "application/json"],
    ],
    timeoutMs: 1000,
    maxResponseBytes: 80_000,
    initial: Buffer.from("{}").toString("base64"),
    ...overrides,
  };
}

it("holds upload until dispatch and rechecks the live route grant", async () => {
  let allowed = true;
  const fetch = vi.fn<() => Promise<Response>>(async () => new Response(null));
  const prepare = vi.fn<NativeProviderNetwork["prepare"]>(() =>
    allowed ? fetch : null
  );
  const egress = new NativeProviderEgress(
    { prepare },
    "openai-compatible",
    endpoint,
    "fixture"
  );
  expect(await egress.exchange(open({ target: target + "?extra=1" }))).toEqual({
    status: "unavailable",
  });
  expect(
    await egress.exchange(open({ headers: [["cookie", "private"]] }))
  ).toEqual({ status: "unavailable" });
  expect(await egress.exchange(open())).toEqual({ status: "accepted" });
  expect(prepare).not.toHaveBeenCalled();
  allowed = false;
  expect(await egress.exchange({ id, action: "dispatch" })).toEqual({
    status: "unavailable",
  });
  expect(fetch).not.toHaveBeenCalled();
  egress.close();
});

it("bounds uploads and projects a bounded response stream with no replay", async () => {
  const bytes = Buffer.alloc(65_536, 72);
  const fetch = vi.fn<() => Promise<Response>>(
    async () =>
      new Response(bytes, {
        status: 302,
        headers: {
          location: "https://other.invalid",
          "x-request-id": "opaque-id",
          "retry-after": "2",
        },
      })
  );
  const egress = new NativeProviderEgress(
    { prepare: () => fetch },
    "openai-compatible",
    endpoint,
    "fixture"
  );
  expect(await egress.exchange(open())).toEqual({ status: "accepted" });
  const encoded = Buffer.alloc(64 * 1024, 42).toString("base64");
  for (let index = 0; index < 15; index++) {
    expect(
      await egress.exchange({ id, action: "append", data: encoded })
    ).toEqual({ status: "accepted" });
  }
  expect(
    await egress.exchange({ id, action: "append", data: encoded })
  ).toEqual({ status: "unavailable" });
  expect(fetch).not.toHaveBeenCalled();
  expect(await egress.exchange(open())).toEqual({ status: "accepted" });
  expect(await egress.exchange({ id, action: "dispatch" })).toEqual({
    status: "ready",
    httpStatus: 302,
    requestId: "opaque-id",
    retryAfterMs: 2000,
  });
  for (let index = 0; index < 2; index++) {
    expect(await egress.exchange({ id, action: "read" })).toEqual({
      status: "chunk",
      data: bytes.subarray(0, 32 * 1024).toString("base64"),
    });
  }
  expect(await egress.exchange({ id, action: "read" })).toEqual({
    status: "end",
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  egress.close();
});

it("cancels a held network exchange on pipe shutdown", async () => {
  const fetch = vi.fn<(body: Buffer, signal: AbortSignal) => Promise<Response>>(
    async (_body: Buffer, signal: AbortSignal) =>
      new Promise<Response>((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(new Error("private detail")),
          { once: true }
        );
      })
  );
  const egress = new NativeProviderEgress(
    { prepare: () => fetch },
    "openai-compatible",
    endpoint,
    "fixture"
  );
  expect(await egress.exchange(open())).toEqual({ status: "accepted" });
  const active = egress.exchange({ id, action: "dispatch" });
  egress.close();
  expect(await active).toEqual({ status: "interrupted" });
  expect(fetch.mock.calls[0][1].aborted).toBe(true);
});

const resourcesPath = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;

it.skipIf(!resourcesPath)(
  "runs a real native prompt through the approved broker without direct HTTP",
  async () => {
    const root = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), "grida-provider-egress-")
    );
    const cwd = path.join(root, "workspace");
    fs.mkdirSync(cwd, { mode: 0o700 });
    const prompt = "A".repeat(73 * 1024) + " end of input";
    const reply = "Approved route replied. 그리다";
    const updates: unknown[] = [];
    const dispatch = vi.fn<(body: Buffer) => Promise<Response>>(
      async (body) => {
        const input = JSON.parse(body.toString("utf8"));
        expect(input.model).toBe("fixture");
        expect(input.messages.at(-1).content).toBe(prompt);
        const event = Buffer.from(
          [
            {
              id: "fixture",
              choices: [
                {
                  index: 0,
                  delta: { role: "assistant", content: reply },
                  finish_reason: null,
                },
              ],
            },
            {
              id: "fixture",
              choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
            },
          ]
            .map((frame) => `data: ${JSON.stringify(frame)}\n\n`)
            .join("") + "data: [DONE]\n\n"
        );
        const split = event.indexOf(Buffer.from("그")) + 1;
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(event.subarray(0, split));
              controller.enqueue(event.subarray(split));
              controller.close();
            },
          }),
          {
            headers: {
              "content-type": "text/event-stream",
              "x-request-id": "fixture-egress",
            },
          }
        );
      }
    );
    const prepare = vi.fn<NativeProviderNetwork["prepare"]>(() => dispatch);
    let agent: NativeAgentProcess | undefined;
    try {
      const selection = await NativeProviderSelection.configuredEndpoint(
        "fixture_endpoint",
        undefined,
        {
          list: async () => [
            {
              id: "fixture_endpoint",
              base_url: endpoint,
              models: [{ id: "fixture" }],
            },
          ],
          hasKey: async () => false,
          network: async () => ({ prepare }),
        }
      );
      agent = await NativeAgentProcess.start({
        ...selection,
        resourcesPath: resourcesPath!,
        stateDirectory: path.join(root, "state"),
        onSessionUpdate: (update) => updates.push(update),
      });
      const { sessionId } = (await agent.request("session/new", {
        cwd,
        mcpServers: [],
      })) as { sessionId: string };
      const result = await agent.request("session/prompt", {
        sessionId,
        prompt: [{ type: "text", text: prompt }],
      });
      expect(result).toMatchObject({ stopReason: "end_turn" });
      expect(JSON.stringify(updates)).toContain(reply);
      expect(prepare).toHaveBeenCalledTimes(1);
      expect(prepare.mock.calls[0]).toEqual([target, expect.any(Headers)]);
      expect(dispatch).toHaveBeenCalledTimes(1);
      await agent.close();
    } finally {
      try {
        await agent?.close();
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  },
  12_000
);
