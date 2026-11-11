// GRIDA-SEC-004 / GRIDA-SEC-014 — native provider admission and custody.
import { AuthStore, SecretsStore } from "@grida/daemon/server";
import { ProviderCredentialStore } from "@grida/auth/providers";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { NativeAgentChat } from "./native-agent-chat";
import { NativeAgentProcess } from "./native-agent-process";
import { NativeChatProfiles } from "./native-chat-profiles";
import { NativeProviderSelection } from "./native-provider-selection";
import {
  NativeProviderEgress,
  type NativeProviderNetwork,
} from "./native-provider-egress";

const base = "http://127.0.0.1:11434/v1";
const target = `${base}/chat/completions`;
const config = {
  id: "local",
  base_url: base,
  models: [{ id: "alpha" }, { id: "beta" }],
  default_model_id: "beta",
};
const byokModel = "openai/gpt-5.5";
const sharedCustody =
  process.platform === "darwin" || process.platform === "linux";
const packaged = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;

async function privateHome() {
  return await fs.mkdtemp(
    path.join(await fs.realpath(os.tmpdir()), "grida-native-byok-")
  );
}

function settings() {
  const dispatch = vi.fn<() => Promise<Response>>();
  const prepare = vi.fn<NativeProviderNetwork["prepare"]>(() => dispatch);
  return {
    list: vi.fn<() => Promise<(typeof config)[]>>(async () => [config]),
    hasKey: vi.fn<(id: string) => Promise<boolean>>(async () => false),
    network: vi.fn<
      (id: string, baseUrl: string) => Promise<NativeProviderNetwork>
    >(async () => ({ prepare })),
    prepare,
    dispatch,
  };
}

it("uses a registered model and binds the anonymous launch to the approved route", async () => {
  const owner = settings();
  const launch = await NativeProviderSelection.configuredEndpoint(
    "local",
    undefined,
    owner
  );
  expect(launch).toMatchObject({
    provider: "openai-compatible",
    endpoint: base,
    model: "beta",
  });
  expect(NativeChatProfiles.binding("local", launch)).toBe(
    "f7f349efbe0f9d67c2a98163ebbd002349c92818a84b0b2a787142cc05cbf30b"
  );
  expect(owner.network).toHaveBeenCalledExactlyOnceWith("local", base);
  expect(
    launch.providerNetwork.prepare(`${target}?other=1`, new Headers())
  ).toBeNull();
  expect(
    launch.providerNetwork.prepare(
      target,
      new Headers({ authorization: "Bearer fixture" })
    )
  ).toBeNull();
  expect(owner.prepare).not.toHaveBeenCalled();
  expect(launch.providerNetwork.prepare(target, new Headers())).toBe(
    owner.dispatch
  );
  owner.prepare.mockReturnValue(null);
  expect(launch.providerNetwork.prepare(target, new Headers())).toBeNull();
  const explicit = await NativeProviderSelection.configuredEndpoint(
    "local",
    "alpha",
    owner
  );
  expect(explicit.model).toBe("alpha");
});

it("refuses missing selections, models and approval", async () => {
  const owner = settings();
  const select = (provider: string, model?: string) =>
    NativeProviderSelection.configuredEndpoint(provider, model, owner);
  await expect(select("other")).rejects.toThrow(
    "native_provider_endpoint_unavailable"
  );
  await expect(select("local", "unknown")).rejects.toThrow(
    "native_provider_model_unavailable"
  );
  expect(owner.network).not.toHaveBeenCalled();
  owner.network.mockRejectedValueOnce(
    new Error("native_provider_endpoint_not_approved")
  );
  await expect(select("local")).rejects.toThrow(
    "native_provider_endpoint_not_approved"
  );
});

it("retains ordinary connection choices at capacity when local counting is enabled", async () => {
  const owner = settings();
  const endpoints = Array.from({ length: 4 }, (_, index) => ({
    id: `local-${index}`,
    base_url: base,
    models: Array.from({ length: 64 }, (_, model) => ({
      id: `model-${model}`,
    })),
    default_model_id: "model-0",
  }));
  const select = (id: string, model?: string, counting?: true) =>
    NativeProviderSelection.configuredEndpoint(id, model, owner, counting);
  owner.list.mockResolvedValue(endpoints);
  const ordinary = await NativeChatProfiles.configuredChoices(
    endpoints,
    select
  );
  expect(ordinary.choices).toHaveLength(256);
  const optedIn = [
    { ...endpoints[0], input_counting: "llama.cpp" as const },
    ...endpoints.slice(1),
  ];
  owner.list.mockResolvedValue(optedIn);
  await expect(
    NativeChatProfiles.configuredChoices(optedIn, select)
  ).resolves.toEqual(ordinary);
});

it.each([
  "http://192.168.0.8:11434/v1",
  "http://127.0.0.1.example.test/v1",
  "http://[::ffff:192.168.0.8]/v1",
  "http://[::127.0.0.1]/v1",
])(
  "withholds a saved plain HTTP endpoint outside loopback at %s",
  async (endpoint) => {
    const owner = settings();
    const saved = { ...config, base_url: endpoint };
    owner.list.mockResolvedValue([saved]);
    const select = (id: string) =>
      NativeProviderSelection.configuredEndpoint(id, undefined, owner);

    await expect(select(saved.id)).rejects.toThrow(
      "native_provider_endpoint_https_required"
    );
    await expect(
      NativeChatProfiles.configuredChoices([saved], select)
    ).resolves.toEqual({
      choices: [],
      previousIds: [],
    });
    expect(owner.hasKey).not.toHaveBeenCalled();
    expect(owner.network).not.toHaveBeenCalled();
    expect(await owner.list()).toEqual([saved]);
  }
);

it.each([
  "http://LOCALHOST:11434/v1",
  "http://127.8.12.24:11434/v1",
  "http://[::1]:11434/v1",
  "http://[::ffff:127.8.12.24]:11434/v1",
  "https://192.168.0.8:11434/v1",
])("preserves approved native endpoint selection at %s", async (endpoint) => {
  const owner = settings();
  owner.list.mockResolvedValue([{ ...config, base_url: endpoint }]);
  await expect(
    NativeProviderSelection.configuredEndpoint("local", undefined, owner)
  ).resolves.toMatchObject({ endpoint, model: "beta" });
  expect(owner.network).toHaveBeenCalledExactlyOnceWith("local", endpoint);
});

it.each([
  "ftp://localhost/v1",
  "https://user:password@example.test/v1",
  "https://example.test/v1?",
  "https://example.test/v1#",
])("refuses an invalid saved native endpoint at %s", async (endpoint) => {
  const owner = settings();
  owner.list.mockResolvedValue([{ ...config, base_url: endpoint }]);
  await expect(
    NativeProviderSelection.configuredEndpoint("local", undefined, owner)
  ).rejects.toThrow("native_provider_endpoint_invalid");
  expect(owner.hasKey).not.toHaveBeenCalled();
  expect(owner.network).not.toHaveBeenCalled();
});

it.runIf(sharedCustody)(
  "refuses a non-ASCII saved key without exposing it",
  async () => {
    const home = await privateHome();
    const owner = settings();
    try {
      await new ProviderCredentialStore({ home }).set("local", "fixture-⚡");
      owner.hasKey.mockResolvedValue(true);
      await expect(
        NativeProviderSelection.configuredEndpoint("local", undefined, {
          ...owner,
          credentialHome: home,
        })
      ).rejects.toThrow(/^native_provider_credential_unavailable$/);
      expect(owner.network).not.toHaveBeenCalled();
    } finally {
      await fs.rm(home, { recursive: true, force: true });
    }
  }
);

it.runIf(sharedCustody)(
  "binds a custom key to its exact route and never selects a reserved vendor key",
  async () => {
    const home = await privateHome();
    const owner = settings();
    try {
      await new ProviderCredentialStore({ home }).set("local", "fixture");
      owner.hasKey.mockResolvedValue(true);
      const selected = await NativeProviderSelection.configuredEndpoint(
        "local",
        undefined,
        { ...owner, credentialHome: home }
      );
      expect(selected).toMatchObject({
        credentialHome: home,
        configuredEndpointKey: "local",
      });
      const headers = new Headers({ authorization: "Bearer fixture" });
      expect(
        selected.providerNetwork.prepare(target, new Headers())
      ).toBeNull();
      expect(
        selected.providerNetwork.prepare(target + "?other=1", headers)
      ).toBeNull();
      expect(owner.prepare).not.toHaveBeenCalled();
      owner.dispatch.mockResolvedValue(new Response());
      await selected.providerNetwork.prepare(target, headers)!(
        Buffer.from("{}"),
        new AbortController().signal
      );
      expect(owner.prepare).toHaveBeenCalledExactlyOnceWith(target, headers);
      owner.list.mockResolvedValue([{ ...config, id: "openai" }]);
      await expect(
        NativeProviderSelection.configuredEndpoint("openai", undefined, {
          ...owner,
          credentialHome: home,
        })
      ).rejects.toThrow("native_provider_endpoint_credential_id_reserved");
      expect(owner.network).toHaveBeenCalledExactlyOnceWith("local", base);
    } finally {
      await fs.rm(home, { recursive: true, force: true });
    }
  }
);

const byokProviders = [
  ["openrouter", "https://openrouter.ai/api/v1"],
  ["vercel", "https://ai-gateway.vercel.sh/v1"],
] as const;

type ByokRequest = {
  model: string;
  messages: { role: string }[];
  tools?: { function: { name: string } }[];
};

function byokReply(delta: object, finish_reason: "stop" | "tool_calls") {
  return new Response(
    `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason }] })}\n\ndata: [DONE]\n\n`,
    { headers: { "content-type": "text/event-stream" } }
  );
}

function byokTool(name: string, args: object) {
  return byokReply(
    {
      tool_calls: [
        {
          index: 0,
          id: name,
          type: "function",
          function: { name, arguments: JSON.stringify(args) },
        },
      ],
    },
    "tool_calls"
  );
}

it.runIf(sharedCustody && Boolean(packaged)).each(byokProviders)(
  "enables bounded child work on the saved %s provider across restart",
  async (provider, endpoint) => {
    const root = await privateHome();
    const workspace = path.join(root, "workspace");
    const home = path.join(root, "credentials");
    const stateDirectory = path.join(root, "state");
    const secrets = new SecretsStore(
      new AuthStore(path.join(root, "legacy")),
      home
    );
    const dispatch = vi.fn<
      (body: Buffer, signal: AbortSignal) => Promise<Response>
    >(async (body) => {
      const request = JSON.parse(body.toString());
      expect(request.model).toBe(byokModel);
      return new Response(
        'data: {"choices":[{"index":0,"delta":{"content":"Bounded work complete."},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'
      );
    });
    const prepare = vi.fn<NativeProviderNetwork["prepare"]>(() => dispatch);
    let agent: NativeAgentProcess | undefined;
    try {
      await fs.mkdir(workspace, { mode: 0o700 });
      await secrets.set(provider, "fixture-key");
      const profile = await NativeProviderSelection.builtInByok(
        provider,
        byokModel,
        {
          credentialHome: home,
          hasKey: (id) => secrets.has(id),
          network: async () => ({ prepare }),
        }
      );
      const open = () =>
        NativeAgentProcess.start({
          ...profile,
          resourcesPath: packaged!,
          stateDirectory,
          capabilities: { "co.grida/session/snapshot": 1 },
        });
      agent = await open();
      expect(agent.acceptsSubagents).toBe(true);
      expect(agent.acceptsEffort).toBe(true);
      expect(agent.acceptsGoalEffort).toBe(false);
      expect(agent.acceptsGoalNamedChild).toBe(false);
      const { sessionId } = (await agent.request("session/new", {
        cwd: workspace,
        mcpServers: [],
      })) as { sessionId: string };
      await agent.request("session/prompt", {
        sessionId,
        prompt: [{ type: "text", text: "Parent task" }],
      });
      const { latest } = (await agent.request("_co.grida/session/snapshot", {
        sessionId,
      })) as { latest: { turnId: string } };
      const { childId } = (await agent.request("_co.grida/subagent/create", {
        parentSessionId: sessionId,
        requestId: "create-researcher",
        name: "Researcher",
        workTurns: 2,
      })) as { childId: string };
      const assignment = {
        parentSessionId: sessionId,
        childId,
        parentTurnId: latest.turnId,
        inputId: "first-assignment",
        instructions: "Research",
      };
      await agent.request("_co.grida/subagent/assign", assignment);
      const inspect = () =>
        agent!.request("_co.grida/subagent/inspect", {
          parentSessionId: sessionId,
          childId,
          inputId: assignment.inputId,
        }) as Promise<{ assignment: { result: { text: string } | null } }>;
      await vi.waitFor(
        async () =>
          expect((await inspect()).assignment.result?.text).toBe(
            "Bounded work complete."
          ),
        { timeout: 10_000 }
      );
      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(
        prepare.mock.calls.every(
          ([target]) => target === `${endpoint}/chat/completions`
        )
      ).toBe(true);
      await agent.close();
      agent = await open();
      await agent.request("session/load", {
        sessionId,
        cwd: workspace,
        mcpServers: [],
      });
      expect((await inspect()).assignment.result?.text).toBe(
        "Bounded work complete."
      );
      await agent.request("_co.grida/subagent/assign", assignment);
      expect(dispatch).toHaveBeenCalledTimes(2);
    } finally {
      await agent?.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  },
  30_000
);

it.runIf(sharedCustody && Boolean(packaged)).each(byokProviders)(
  "collects an ordinary Ultra review on saved %s without enabling Goal funding",
  async (provider, endpoint) => {
    const root = await privateHome();
    const cwd = path.join(root, "workspace");
    const credentialHome = path.join(root, "credentials");
    const store = new SecretsStore(
      new AuthStore(path.join(root, "legacy")),
      credentialHome
    );
    const assignment = "Inspect the sample independently.";
    const finding = "The sample is missing a required field.";
    const prompt = "Private parent task context.";
    const release = Promise.withResolvers<void>();
    const dispatch = vi.fn<
      (body: Buffer, signal: AbortSignal) => Promise<Response>
    >(async (body) => {
      const request = JSON.parse(body.toString()) as ByokRequest;
      if (!request.tools) {
        await release.promise;
        return byokReply({ content: finding }, "stop");
      }
      if (JSON.stringify(request.messages).includes(finding))
        return byokReply(
          { content: "Integrated the independent finding." },
          "stop"
        );
      if (request.messages.some(({ role }) => role === "tool")) {
        release.resolve();
        return byokTool("collect_review", {});
      }
      return byokTool("delegate_review", { instructions: assignment });
    });
    const prepare = vi.fn<NativeProviderNetwork["prepare"]>(() => dispatch);
    let chat: NativeAgentChat | undefined;
    try {
      await fs.mkdir(cwd, { mode: 0o700 });
      await store.set(provider, "fixture-key");
      const profile = await NativeProviderSelection.builtInByok(
        provider,
        byokModel,
        {
          credentialHome,
          hasKey: (id) => store.has(id),
          network: async () => ({ prepare }),
        }
      );
      chat = await NativeAgentChat.start({
        ...profile,
        cwd,
        stateDirectory: path.join(root, "state"),
        resourcesPath: packaged!,
      });
      expect(chat.acceptsEffort).toBe(true);
      expect(chat.acceptsGoalEffort).toBe(false);
      const session = await chat.create();
      expect(
        (await chat.observe(session)).goalNamedChildAvailable
      ).toBeUndefined();
      await expect(
        chat.startGoal(session, "funded-goal", {
          objective: "Review the sample",
          criteria: ["Review the required fields"],
          allowance: { workTurns: 2, inferenceSteps: 8 },
          automatic: false,
          effort: "ultra",
        })
      ).rejects.toThrow("native_chat_goal_effort_unavailable");
      expect(dispatch).not.toHaveBeenCalled();
      const regime = provider === "openrouter" ? "plan" : "act";
      await chat.submit(
        session,
        "ordinary-ultra",
        prompt,
        regime,
        undefined,
        "ultra"
      );
      const settled = await vi.waitFor(
        async () => {
          const view = await chat!.observe(session);
          expect(view.latest?.status).toBe("succeeded");
          return view;
        },
        { timeout: 10_000 }
      );
      expect(await chat.turnSummary(session, settled)).toMatchObject({
        text: "Integrated the independent finding.",
        reviewFindingsCollected: true,
      });
      expect(dispatch).toHaveBeenCalledTimes(4);
      expect(
        prepare.mock.calls.map(([url, headers]) => [
          url,
          headers.get("authorization"),
        ])
      ).toEqual(
        Array.from({ length: 4 }, () => [
          `${endpoint}/chat/completions`,
          "Bearer fixture-key",
        ])
      );
      const requests = dispatch.mock.calls.map(
        ([body]) => JSON.parse(body.toString()) as ByokRequest
      );
      expect(requests.map(({ model }) => model)).toEqual(
        Array(4).fill(byokModel)
      );
      const child = requests.find(({ tools }) => !tools);
      expect(JSON.stringify(child)).toContain(assignment);
      expect(JSON.stringify(child)).not.toContain(prompt);
      expect(requests[0].tools?.map(({ function: { name } }) => name)).toEqual(
        expect.arrayContaining(["delegate_review", "collect_review"])
      );
    } finally {
      release.resolve();
      await chat?.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  },
  30_000
);

it.runIf(sharedCustody && Boolean(packaged))(
  "refuses an admitted Ultra child exchange when its saved key changes before dispatch",
  async () => {
    const [provider, endpoint] = byokProviders[0];
    const root = await privateHome();
    const cwd = path.join(root, "workspace");
    const credentialHome = path.join(root, "credentials");
    const store = new SecretsStore(
      new AuthStore(path.join(root, "legacy")),
      credentialHome
    );
    const assignment = "Inspect the sample for rotation evidence.";
    const rotated = Promise.withResolvers<void>();
    let childUploadAccepted = false;
    const dispatch = vi.fn<
      (body: Buffer, signal: AbortSignal) => Promise<Response>
    >(async (body) => {
      const request = JSON.parse(body.toString()) as ByokRequest;
      if (
        request.messages.some(({ role }) => role === "tool") ||
        !request.tools
      ) {
        await rotated.promise;
        return byokReply(
          { content: "No independent finding collected." },
          "stop"
        );
      }
      return byokTool("delegate_review", { instructions: assignment });
    });
    const prepare = vi.fn<NativeProviderNetwork["prepare"]>(() => dispatch);
    const exchange = NativeProviderEgress.prototype.exchange;
    const observeUpload = vi
      .spyOn(NativeProviderEgress.prototype, "exchange")
      .mockImplementation(async function (this: NativeProviderEgress, request) {
        const reply = await exchange.call(this, request);
        const frame = request as { action?: string; initial?: string };
        if (
          frame.action === "open" &&
          reply.status === "accepted" &&
          frame.initial
        ) {
          const body = JSON.parse(
            Buffer.from(frame.initial, "base64").toString()
          ) as ByokRequest;
          if (
            !body.tools &&
            JSON.stringify(body.messages).includes(assignment)
          ) {
            await store.set(provider, "rotated-fixture-key");
            childUploadAccepted = true;
            rotated.resolve();
          }
        }
        return reply;
      });
    let chat: NativeAgentChat | undefined;
    try {
      await fs.mkdir(cwd, { mode: 0o700 });
      await store.set(provider, "fixture-key");
      const profile = await NativeProviderSelection.builtInByok(
        provider,
        byokModel,
        {
          credentialHome,
          hasKey: (id) => store.has(id),
          network: async () => ({ prepare }),
        }
      );
      chat = await NativeAgentChat.start({
        ...profile,
        cwd,
        stateDirectory: path.join(root, "state"),
        resourcesPath: packaged!,
      });
      const session = await chat.create();
      await chat.submit(
        session,
        "review-before-key-rotation",
        "Review the sample.",
        "act",
        undefined,
        "ultra"
      );
      await vi.waitFor(() => expect(childUploadAccepted).toBe(true), {
        timeout: 5_000,
      });
      const current = () => {};
      const { children } = await chat.listSubagents(
        session,
        undefined,
        current
      );
      expect(children).toHaveLength(1);
      const attachment = {};
      await vi.waitFor(
        async () => {
          const observation = await chat!.inspectSubagent(
            attachment,
            session,
            children[0].childId,
            undefined,
            current
          );
          expect(observation.child.assignment?.result?.status).toBe("failed");
          expect((await chat!.observe(session)).latest?.disposition).toBe(
            "settled"
          );
        },
        { timeout: 5_000 }
      );
      expect(dispatch).toHaveBeenCalled();
      expect(
        dispatch.mock.calls.every(
          ([body]) =>
            (JSON.parse(body.toString()) as ByokRequest).tools !== undefined
        )
      ).toBe(true);
      expect(
        prepare.mock.calls.map(([url, headers]) => [
          url,
          headers.get("authorization"),
        ])
      ).toEqual(
        dispatch.mock.calls.map(() => [
          `${endpoint}/chat/completions`,
          "Bearer fixture-key",
        ])
      );
    } finally {
      rotated.resolve();
      observeUpload.mockRestore();
      await chat?.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  },
  30_000
);

it.runIf(sharedCustody).each([...byokProviders, ["local", base]] as const)(
  "rechecks %s custody and grants before network admission",
  async (provider, endpoint) => {
    const home = await privateHome();
    const store = new ProviderCredentialStore({ home });
    const owner = settings();
    const custom = provider === "local";
    const raw = custom ? "fixture-key " : " fixture-key ";
    let finish!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    owner.dispatch.mockReturnValue(response);
    try {
      await store.set(provider, raw);
      owner.hasKey.mockResolvedValue(true);
      const profile = custom
        ? await NativeProviderSelection.configuredEndpoint(
            provider,
            undefined,
            { ...owner, credentialHome: home }
          )
        : await NativeProviderSelection.builtInByok(provider, byokModel, {
            credentialHome: home,
            hasKey: owner.hasKey,
            network: () => owner.network(provider, endpoint),
          });
      const route = `${endpoint}/chat/completions`;
      const headers = new Headers({ authorization: "Bearer fixture-key" });
      expect(
        profile.providerNetwork.prepare(
          route,
          new Headers({ authorization: "Bearer other" })
        )
      ).toBeNull();
      const send = profile.providerNetwork.prepare(route, headers)!;
      const signal = new AbortController();
      const cancelled = new AbortController();
      cancelled.abort();
      expect(await send(Buffer.from("{}"), cancelled.signal)).toBeNull();
      expect(owner.prepare).not.toHaveBeenCalled();
      await store.set(provider, "rotated-key");
      expect(await send(Buffer.from("{}"), signal.signal)).toBeNull();
      expect(owner.prepare).not.toHaveBeenCalled();
      await store.set(provider, raw);
      owner.prepare.mockReturnValueOnce(null);
      expect(await send(Buffer.from("{}"), signal.signal)).toBeNull();
      expect(owner.dispatch).not.toHaveBeenCalled();
      const running = send(Buffer.from("{}"), signal.signal);
      await vi.waitFor(() => expect(owner.dispatch).toHaveBeenCalledOnce());
      // The provider response remains pending while a writer acquires custody.
      await store.remove(provider);
      finish(new Response("ok"));
      expect((await running)?.status).toBe(200);
      expect(await send(Buffer.from("{}"), signal.signal)).toBeNull();
      expect(owner.dispatch).toHaveBeenCalledOnce();
    } finally {
      finish?.(new Response());
      await fs.rm(home, { recursive: true, force: true });
    }
  }
);

it.runIf(sharedCustody)(
  "keeps a post-initiation custody error uncertain",
  async () => {
    const home = await privateHome();
    const store = new ProviderCredentialStore({ home });
    const owner = settings();
    try {
      await store.set("openrouter", "fixture-key");
      owner.hasKey.mockResolvedValue(true);
      owner.dispatch.mockResolvedValue(new Response());
      const profile = await NativeProviderSelection.builtInByok(
        "openrouter",
        byokModel,
        {
          credentialHome: home,
          hasKey: owner.hasKey,
          network: () => owner.network("openrouter", byokProviders[0][1]),
        }
      );
      const failure = vi
        .spyOn(ProviderCredentialStore.prototype, "admit")
        .mockImplementationOnce(async (_provider, _key, action) => {
          expect(action()).toBe(true);
          throw new Error("synthetic custody release failure");
        });
      try {
        const send = profile.providerNetwork.prepare(
          `${byokProviders[0][1]}/chat/completions`,
          new Headers({ authorization: "Bearer fixture-key" })
        )!;
        await expect(
          send(Buffer.from("{}"), new AbortController().signal)
        ).rejects.toThrow("synthetic custody release failure");
        expect(owner.dispatch).toHaveBeenCalledOnce();
      } finally {
        failure.mockRestore();
      }
    } finally {
      await fs.rm(home, { recursive: true, force: true });
    }
  }
);

it.runIf(sharedCustody).each(byokProviders)(
  "binds the selected %s key to its own exact generation route",
  async (provider, endpoint) => {
    const home = await privateHome();
    const owner = settings();
    try {
      await new ProviderCredentialStore({ home }).set(provider, "fixture");
      owner.hasKey.mockResolvedValue(true);
      const selected = await NativeProviderSelection.builtInByok(
        provider,
        byokModel,
        {
          credentialHome: home,
          hasKey: owner.hasKey,
          network: () => owner.network(provider, endpoint),
        }
      );
      expect(selected).toMatchObject({
        provider: "openai-compatible",
        endpoint,
        model: byokModel,
        credentialHome: home,
      });
      expect(owner.hasKey).toHaveBeenCalledExactlyOnceWith(provider);
      const route = `${endpoint}/chat/completions`;
      const headers = new Headers({ authorization: "Bearer fixture" });
      for (const refused of [
        `${route}?extra=1`,
        `${route}/`,
        `${endpoint}/models`,
        provider === "openrouter"
          ? "https://ai-gateway.vercel.sh/v1/chat/completions"
          : "https://openrouter.ai/api/v1/chat/completions",
        "http://127.0.0.1:11434/v1/chat/completions",
      ])
        expect(selected.providerNetwork.prepare(refused, headers)).toBeNull();
      expect(selected.providerNetwork.prepare(route, new Headers())).toBeNull();
      expect(owner.prepare).not.toHaveBeenCalled();
      owner.dispatch.mockResolvedValue(new Response());
      await selected.providerNetwork.prepare(route, headers)!(
        Buffer.from("{}"),
        new AbortController().signal
      );
      expect(owner.prepare).toHaveBeenCalledExactlyOnceWith(route, headers);
    } finally {
      await fs.rm(home, { recursive: true, force: true });
    }
  }
);

it.runIf(sharedCustody)(
  "refuses unsupported selection, missing key, failed custody and aliases without opening egress",
  async () => {
    const home = await privateHome();
    const owner = settings();
    const select = (
      provider: string,
      model = byokModel,
      credentialHome = home
    ) =>
      NativeProviderSelection.builtInByok(provider, model, {
        credentialHome,
        hasKey: owner.hasKey,
        network: () => owner.network(provider, base),
      });
    try {
      for (const provider of ["gg", "fal", "chatgpt", "constructor", "local"])
        await expect(select(provider)).rejects.toThrow(
          "native_provider_byok_unavailable"
        );
      await expect(select("openrouter", "gpt-5.5")).rejects.toThrow(
        "native_provider_model_unavailable"
      );
      expect(owner.hasKey).not.toHaveBeenCalled();
      await expect(select("openrouter")).rejects.toThrow(
        "native_provider_byok_key_missing"
      );
      owner.hasKey.mockRejectedValueOnce(new Error("storage_failed"));
      await expect(select("openrouter")).rejects.toThrow("storage_failed");
      owner.hasKey.mockResolvedValue(true);
      const alias = path.join(home, "alias");
      await fs.symlink(home, alias);
      await expect(select("openrouter", byokModel, alias)).rejects.toThrow(
        "native_provider_byok_home_invalid"
      );
      expect(owner.network).not.toHaveBeenCalled();
    } finally {
      await fs.rm(home, { recursive: true, force: true });
    }
  }
);

it
  .runIf(sharedCustody && Boolean(packaged))
  .each([...byokProviders, ["local", base]] as const)(
  "runs a native %s turn and refuses replacement credentials through the old launch",
  async (provider, endpoint) => {
    const home = await privateHome();
    const cwd = path.join(home, "workspace");
    const stateDirectory = path.join(home, "state");
    const credentialHome = path.join(home, "custody");
    const store = new SecretsStore(
      new AuthStore(path.join(home, "legacy")),
      credentialHome
    );
    const key = `${provider}-fixture-key`;
    const custom = provider === "local";
    const model = custom ? config.default_model_id : byokModel;
    const dispatch = vi.fn<
      (body: Buffer, signal: AbortSignal) => Promise<Response>
    >(
      async () =>
        new Response(
          'data: {"id":"fixture","choices":[{"index":0,"delta":{"content":"BYOK fixture answer"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
          { headers: { "content-type": "text/event-stream" } }
        )
    );
    const prepare = vi.fn<NativeProviderNetwork["prepare"]>(() => dispatch);
    let chat: NativeAgentChat | undefined;
    let restoreExchange: (() => void) | undefined;
    try {
      await fs.mkdir(cwd, { mode: 0o700 });
      await store.set(provider, custom ? `${key} ` : ` ${key} `);
      const settings = {
        credentialHome,
        hasKey: (id: string) => store.has(id),
        network: async () => ({ prepare }),
      };
      const profile = custom
        ? await NativeProviderSelection.configuredEndpoint(provider, model, {
            ...settings,
            list: async () => [config],
          })
        : await NativeProviderSelection.builtInByok(provider, model, settings);
      chat = await NativeAgentChat.start({
        ...profile,
        cwd,
        stateDirectory,
        resourcesPath: packaged!,
      });
      const session = await chat.create();
      const first = await chat.submit(
        session,
        "byok-fixture-first",
        "A fixture request"
      );
      await vi.waitFor(
        async () => {
          expect((await chat!.observe(session)).latest).toMatchObject({
            turnId: first.turnId,
            status: "succeeded",
          });
        },
        { timeout: 4000 }
      );
      expect(prepare).toHaveBeenCalledTimes(1);
      expect(prepare.mock.calls[0][0]).toBe(`${endpoint}/chat/completions`);
      expect(prepare.mock.calls[0][1].get("authorization")).toBe(
        `Bearer ${key}`
      );
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(JSON.parse(dispatch.mock.calls[0][0].toString())).toMatchObject({
        model,
        stream: true,
      });
      const transcript = JSON.stringify(await chat.transcript(session));
      expect(transcript).toContain("BYOK fixture answer");
      expect(transcript).not.toContain(key);
      let rotated = false;
      const exchange = NativeProviderEgress.prototype.exchange;
      const spy = vi
        .spyOn(NativeProviderEgress.prototype, "exchange")
        .mockImplementation(
          async function (this: NativeProviderEgress, request) {
            if (
              !custom &&
              (request as { action?: string })?.action === "dispatch" &&
              !rotated
            ) {
              await store.set(provider, `rotated-${key}`);
              rotated = true;
            }
            const reply = await exchange.call(this, request);
            if (
              custom &&
              (request as { action?: string })?.action === "append" &&
              !rotated
            ) {
              await store.set(provider, `rotated-${key}`);
              rotated = true;
            }
            return reply;
          }
        );
      restoreExchange = () => spy.mockRestore();
      const second = await chat.submit(
        session,
        "byok-fixture-second",
        custom ? "\\".repeat(36_000) : "Another fixture request"
      );
      await vi.waitFor(
        async () => {
          expect((await chat!.observe(session)).latest).toMatchObject({
            turnId: second.turnId,
            status: "failed",
          });
        },
        { timeout: 4000 }
      );
      expect(rotated).toBe(true);
      expect(dispatch).toHaveBeenCalledTimes(1);
      await chat.close();
      expect(
        (
          await fs.readFile(path.join(stateDirectory, "runtime.sqlite"))
        ).includes(key)
      ).toBe(false);
    } finally {
      restoreExchange?.();
      await chat?.close();
      await fs.rm(home, { recursive: true, force: true });
    }
  },
  15_000
);
