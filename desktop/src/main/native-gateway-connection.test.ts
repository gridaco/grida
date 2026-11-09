// GRIDA-SEC-006 — the account-scoped bearer stays in the main connector.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import type {
  DesktopAccountSession,
  DesktopGatewayGrant,
} from "./account-session";
import { NativeGatewayConnection } from "./native-gateway-connection";
import type { NativeProviderNetwork } from "./native-provider-egress";
import { NativeAgentProcess } from "./native-agent-process";

const origin = "https://grida.test";
const target = `${origin}/api/v1/ai/chat/completions`;
const body = Buffer.from("{}");

function fixture(first?: Partial<DesktopGatewayGrant>) {
  const grant = {
    token: "synthetic.fixture.initial",
    expiresAt: Date.now() + 120_000,
    subject: "fixture-user",
    organizationId: 12,
    isCurrent: () => true,
    ...first,
  };
  const mint = vi.fn<DesktopAccountSession["withGatewayGrant"]>(
    async (_, accept) => accept(grant)
  );
  const dispatch = vi.fn<
    (body: Buffer, signal: AbortSignal) => Promise<Response>
  >(async () => new Response("fixture"));
  const prepare = vi.fn<NativeProviderNetwork["prepare"]>(() => dispatch);
  return {
    grant,
    mint,
    dispatch,
    prepare,
    options: {
      origin,
      account: { withGatewayGrant: mint },
      network: { prepare },
    },
  };
}

it("injects only the current scoped bearer into the fixed Gateway chat request", async () => {
  let live = true;
  const owner = fixture({ isCurrent: () => live });
  const connection = await NativeGatewayConnection.open(owner.options);
  expect(connection.scope).toMatch(/^[a-f0-9]{64}$/);
  expect(connection.endpoint).toBe(`${origin}/api/v1/ai`);
  expect(JSON.stringify(connection)).not.toContain("synthetic.fixture.initial");
  expect(connection.prepare(`${target}?extra=1`, new Headers())).toBeNull();
  expect(
    connection.prepare(
      target,
      new Headers({ authorization: "Bearer untrusted" })
    )
  ).toBeNull();
  const headers = new Headers({ accept: "text/event-stream" });
  const request = connection.prepare(target, headers)!;
  expect(await request(body, new AbortController().signal)).toBeInstanceOf(
    Response
  );
  expect(headers.has("authorization")).toBe(false);
  expect(owner.prepare.mock.calls[0][0]).toBe(target);
  expect(owner.prepare.mock.calls[0][1].get("authorization")).toBe(
    "Bearer synthetic.fixture.initial"
  );
  expect(owner.dispatch).toHaveBeenCalledTimes(1);
  live = false;
  expect(await request(body, new AbortController().signal)).toBeNull();
  expect(owner.dispatch).toHaveBeenCalledTimes(1);
  connection.close();
});

it("shares renewal within the captured account and organization", async () => {
  const owner = fixture({ expiresAt: Date.now() + 1_000 });
  const connection = await NativeGatewayConnection.open(owner.options);
  const replacement = Promise.withResolvers<void>();
  owner.mint.mockImplementationOnce(async (_, accept) => {
    await replacement.promise;
    accept({
      ...owner.grant,
      token: "synthetic.fixture.renewed",
      expiresAt: Date.now() + 120_000,
    });
  });
  const request = connection.prepare(target, new Headers())!;
  const signal = new AbortController().signal;
  const attempts = [request(body, signal), request(body, signal)];
  expect(owner.mint).toHaveBeenCalledTimes(2);
  expect(owner.mint.mock.calls[1][0]).toBe(12);
  expect(owner.dispatch).not.toHaveBeenCalled();
  replacement.resolve();
  await Promise.all(attempts);
  expect(owner.dispatch).toHaveBeenCalledTimes(2);
  expect(
    owner.prepare.mock.calls.map(([, headers]) => headers.get("authorization"))
  ).toEqual(Array(2).fill("Bearer synthetic.fixture.renewed"));
  connection.close();
});

it("does not dispatch after a scope change, a cancelled request, or close during renewal", async () => {
  const owner = fixture({ expiresAt: Date.now() + 1_000 });
  const connection = await NativeGatewayConnection.open(owner.options);
  const request = connection.prepare(target, new Headers())!;
  const signal = new AbortController();
  signal.abort();
  expect(await request(body, signal.signal)).toBeNull();
  owner.mint.mockImplementationOnce(async (_, accept) =>
    accept({
      ...owner.grant,
      subject: "someone-else",
      expiresAt: Date.now() + 120_000,
    })
  );
  expect(await request(body, new AbortController().signal)).toBeNull();
  const replacement = Promise.withResolvers<void>();
  owner.mint.mockImplementationOnce(async (_, accept) => {
    await replacement.promise;
    accept({ ...owner.grant, expiresAt: Date.now() + 120_000 });
  });
  const pending = request(body, new AbortController().signal);
  connection.close();
  replacement.resolve();
  expect(await pending).toBeNull();
  expect(owner.dispatch).not.toHaveBeenCalled();
});

const resourcesPath = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;
it.skipIf(!resourcesPath)(
  "restarts a native Gateway chat under its captured scope only",
  async () => {
    const root = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "grida-gateway-scope-")
    );
    const cwd = path.join(root, "workspace");
    await fs.mkdir(cwd);
    const first = fixture();
    const rotated = fixture({ token: "synthetic.fixture.rotated" });
    const changed = fixture({ organizationId: 19 });
    const connections = await Promise.all(
      [first, rotated, changed].map((owner) =>
        NativeGatewayConnection.open(owner.options)
      )
    );
    expect(connections[0].scope).toBe(connections[1].scope);
    expect(connections[2].scope).not.toBe(connections[0].scope);
    for (const owner of [first, rotated, changed]) {
      owner.dispatch.mockImplementation(async (data) => {
        expect(JSON.parse(data.toString()).model).toBe("fixture");
        const reply =
          'data: {"id":"fixture","choices":[{"index":0,"delta":{"content":"Scoped reply"},"finish_reason":null}]}\n\n' +
          'data: {"id":"fixture","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n' +
          "data: [DONE]\n\n";
        return new Response(reply, {
          headers: { "content-type": "text/event-stream" },
        });
      });
    }
    const stateDirectory = path.join(root, "state");
    const open = (connection: NativeGatewayConnection) =>
      NativeAgentProcess.start({
        ...connection.launch("fixture"),
        resourcesPath: resourcesPath!,
        stateDirectory,
      });
    const prompt = (agent: NativeAgentProcess, sessionId: string) =>
      agent.request("session/prompt", {
        sessionId,
        prompt: [{ type: "text", text: "Fixture prompt" }],
      });
    let agent: NativeAgentProcess | undefined;
    try {
      agent = await open(connections[0]);
      const { sessionId } = (await agent.request("session/new", {
        cwd,
        mcpServers: [],
      })) as { sessionId: string };
      await expect(prompt(agent, sessionId)).resolves.toMatchObject({
        stopReason: "end_turn",
      });
      await agent.close();
      agent = await open(connections[1]);
      await agent.request("session/load", { sessionId, cwd, mcpServers: [] });
      await expect(prompt(agent, sessionId)).resolves.toMatchObject({
        stopReason: "end_turn",
      });
      await agent.close();
      agent = await open(connections[2]);
      await agent.request("session/load", { sessionId, cwd, mcpServers: [] });
      await expect(prompt(agent, sessionId)).rejects.toThrow(
        "session_execution_configuration_changed"
      );
      expect(first.dispatch).toHaveBeenCalledTimes(1);
      expect(rotated.dispatch).toHaveBeenCalledTimes(1);
      expect(changed.dispatch).not.toHaveBeenCalled();
    } finally {
      try {
        await agent?.close();
      } finally {
        connections.forEach((connection) => connection.close());
        await fs.rm(root, { recursive: true, force: true });
      }
    }
  },
  20_000
);
