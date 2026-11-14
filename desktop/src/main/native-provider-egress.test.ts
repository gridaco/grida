// GRIDA-SEC-004 / GRIDA-SEC-008 / GRIDA-SEC-014 — private pipe fixtures.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import {
  CHATGPT_CALLBACK_URIS,
  CHATGPT_RESPONSES_URL,
  CHATGPT_TOKEN_URL,
} from "../chatgpt-configuration";
import { NativeAgentProcess } from "./native-agent-process";
import { NativeChatGptHost } from "./native-chatgpt-host";
import {
  NativeProviderEgress,
  type NativeProviderNetwork,
} from "./native-provider-egress";
import { NativeProviderSelection } from "./native-provider-selection";

const endpoint = "http://127.0.0.1:1/v1";
const target = endpoint + "/chat/completions";
const id = "f78fb11f-4e95-4c02-a315-3bcfd15bc536";

it("admits a monetary ceiling only on the opted-in fixed capped Gateway route", async () => {
  const prepare = vi.fn<NativeProviderNetwork["prepare"]>(() => null);
  const raw = open({
    target: target + "/capped",
    headers: [
      ["accept", "text/event-stream"],
      ["content-type", "application/json"],
      ["x-gg-max-cost-mills", "0.001"],
    ],
  });
  const plain = new NativeProviderEgress(
    { prepare },
    "openai-compatible",
    endpoint,
    "fixture"
  );
  expect(await plain.exchange(raw)).toEqual({ status: "unavailable" });
  const capped = new NativeProviderEgress(
    { prepare },
    "openai-compatible",
    endpoint,
    "fixture",
    undefined,
    true
  );
  for (const value of [
    "0",
    "-1",
    "1e3",
    "1.0000000000000000001",
    "1000000000000000000",
    "01",
  ]) {
    expect(
      await capped.exchange({
        ...raw,
        headers: [
          ["accept", "text/event-stream"],
          ["content-type", "application/json"],
          ["x-gg-max-cost-mills", value],
        ],
      })
    ).toEqual({ status: "unavailable" });
  }
  expect(await capped.exchange({ ...raw, target })).toEqual({
    status: "unavailable",
  });
  expect(await capped.exchange(open({ target: target + "/capped" }))).toEqual({
    status: "unavailable",
  });
  expect(await capped.exchange(raw)).toEqual({ status: "accepted" });
  await capped.exchange({ id, action: "dispatch" });
  expect(prepare).toHaveBeenCalledWith(target + "/capped", expect.any(Headers));
  expect(prepare.mock.calls[0][1].get("x-gg-max-cost-mills")).toBe("0.001");
  capped.close();
  plain.close();
});

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

it("allows only the opted-in loopback count route through the live provider grant", async () => {
  const countTarget = target + "/input_tokens";
  const prepare = vi.fn<NativeProviderNetwork["prepare"]>(() => null);
  const openCount = open({
    target: countTarget,
    headers: [
      ["accept", "application/json"],
      ["content-type", "application/json"],
    ],
  });
  const plain = new NativeProviderEgress(
    { prepare },
    "openai-compatible",
    endpoint,
    "fixture"
  );
  expect(await plain.exchange(openCount)).toEqual({ status: "unavailable" });
  expect(prepare).not.toHaveBeenCalled();
  plain.close();

  expect(
    () =>
      new NativeProviderEgress(
        { prepare },
        "openai-compatible",
        "http://localhost:1/v1",
        "fixture",
        true
      )
  ).toThrow("native_provider_input_count_unavailable");
  const counted = new NativeProviderEgress(
    { prepare },
    "openai-compatible",
    endpoint,
    "fixture",
    true
  );
  expect(await counted.exchange(open({ target: countTarget }))).toEqual({
    status: "unavailable",
  });
  expect(
    await counted.exchange({ ...openCount, target: countTarget + "?extra=1" })
  ).toEqual({ status: "unavailable" });
  expect(await counted.exchange(openCount)).toEqual({ status: "accepted" });
  expect(prepare).not.toHaveBeenCalled();
  expect(await counted.exchange({ id, action: "dispatch" })).toEqual({
    status: "unavailable",
  });
  expect(prepare).toHaveBeenCalledExactlyOnceWith(
    countTarget,
    expect.any(Headers)
  );
  counted.close();
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
const subscriptionBase = CHATGPT_RESPONSES_URL.slice(0, -"/responses".length);

it("restricts subscription egress to credential-free requests for the exact generation route", async () => {
  const prepare = vi.fn<NativeProviderNetwork["prepare"]>();
  const egress = new NativeProviderEgress(
    { prepare },
    "chatgpt-subscription",
    subscriptionBase,
    "openai/gpt-5.6-terra"
  );
  const expected = open({ target: CHATGPT_RESPONSES_URL });
  expect(
    await egress.exchange({
      ...expected,
      target: `${CHATGPT_RESPONSES_URL}/input_tokens`,
    })
  ).toEqual({ status: "unavailable" });
  expect(
    await egress.exchange({
      ...expected,
      target: `${CHATGPT_RESPONSES_URL}?changed=1`,
    })
  ).toEqual({ status: "unavailable" });
  expect(
    await egress.exchange({
      ...expected,
      headers: [
        ...(expected.headers as [string, string][]),
        ["authorization", "Bearer synthetic"],
      ],
    })
  ).toEqual({ status: "unavailable" });
  expect(prepare).not.toHaveBeenCalled();
  expect(await egress.exchange(expected)).toEqual({ status: "accepted" });
  egress.close();
});

it.skipIf(!resourcesPath)(
  "runs the private subscription process with provider-managed output and retains encrypted state only within its scope",
  async () => {
    const root = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), "grida-subscription-process-")
    );
    const cwd = path.join(root, "workspace");
    fs.mkdirSync(cwd, { mode: 0o700 });
    const reply = "Subscription fixture reply";
    const encrypted = "private-subscription-reasoning";
    const events = [
      {
        type: "response.output_item.done",
        output_index: 0,
        item: {
          type: "reasoning",
          id: "reasoning-fixture",
          encrypted_content: encrypted,
          summary: [],
        },
      },
      {
        type: "response.output_text.delta",
        item_id: "message-fixture",
        delta: reply,
      },
      {
        type: "response.output_item.done",
        output_index: 1,
        item: {
          type: "message",
          id: "message-fixture",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: reply, annotations: [] }],
        },
      },
      {
        type: "response.completed",
        response: {
          status: "completed",
          usage: { input_tokens: 5, output_tokens: 3 },
        },
      },
    ];
    const dispatch = vi.fn<(body: Buffer) => Promise<Response>>(
      async () =>
        new Response(
          events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
          { headers: { "content-type": "text/event-stream" } }
        )
    );
    const exchangeToken = vi.fn<(body: Buffer) => Promise<Response>>(async () =>
      Response.json({
        access_token: "fixture-access-token",
        refresh_token: "fixture-refresh-token",
        account_id: "fixture-account",
        expires_in: 3600,
      })
    );
    const prepare = vi.fn<NativeProviderNetwork["prepare"]>((target) =>
      target === CHATGPT_TOKEN_URL
        ? exchangeToken
        : target === CHATGPT_RESPONSES_URL
          ? dispatch
          : null
    );
    const owner = () =>
      new NativeChatGptHost(path.join(root, "oauth"), { prepare });
    let host = owner();
    const connect = async () => {
      const start = await host.start(CHATGPT_CALLBACK_URIS[0]);
      const result = await host.complete({
        attempt_id: start.attempt_id,
        state: start.state,
        code: "synthetic-code",
      });
      expect(result).toMatchObject({
        ready: true,
        account: { id: "fixture-account" },
      });
      expect(JSON.stringify(result)).not.toContain("fixture-access-token");
    };
    const updates: unknown[] = [];
    const start = async () =>
      NativeAgentProcess.start({
        ...(await host.launch("openai/gpt-5.6-terra")),
        resourcesPath: resourcesPath!,
        stateDirectory: path.join(root, "state"),
        onSessionUpdate: (value) => updates.push(value),
      });
    let agent: NativeAgentProcess | undefined;
    try {
      await connect();
      agent = await start();
      const { sessionId } = (await agent.request("session/new", {
        cwd,
        mcpServers: [],
      })) as { sessionId: string };
      const prompt = () =>
        agent!.request("session/prompt", {
          sessionId,
          prompt: [{ type: "text", text: "A fixture question" }],
        });
      await expect(prompt()).resolves.toMatchObject({ stopReason: "end_turn" });
      expect(prepare.mock.calls[0][0]).toBe(CHATGPT_TOKEN_URL);
      expect(prepare.mock.calls[1][0]).toBe(CHATGPT_RESPONSES_URL);
      expect(Object.fromEntries(prepare.mock.calls[1][1])).toEqual({
        accept: "text/event-stream",
        "content-type": "application/json",
        authorization: "Bearer fixture-access-token",
        "chatgpt-account-id": "fixture-account",
        "openai-beta": "responses=experimental",
        originator: "grida",
      });
      const first = JSON.parse(dispatch.mock.calls[0][0].toString());
      expect(first).toMatchObject({
        model: "gpt-5.6-terra",
        stream: true,
        store: false,
        reasoning: { effort: "medium" },
        include: ["reasoning.encrypted_content"],
      });
      expect(first).not.toHaveProperty("max_output_tokens");
      expect(JSON.stringify(updates)).toContain(reply);
      expect(JSON.stringify(updates)).not.toContain(encrypted);
      expect(JSON.stringify(updates)).not.toContain("fixture-access-token");
      await agent.close();

      host = owner();
      agent = await start();
      await agent.request("session/load", { sessionId, cwd, mcpServers: [] });
      await expect(prompt()).resolves.toMatchObject({ stopReason: "end_turn" });
      expect(dispatch.mock.calls[1][0].toString()).toContain(encrypted);
      await agent.close();

      await host.signOut();
      await connect();
      agent = await start();
      await agent.request("session/load", { sessionId, cwd, mcpServers: [] });
      await expect(prompt()).rejects.toThrow(
        "session_execution_configuration_changed"
      );
      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(exchangeToken).toHaveBeenCalledTimes(2);
    } finally {
      try {
        await agent?.close();
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  },
  25_000
);

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
