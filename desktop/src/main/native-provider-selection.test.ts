// GRIDA-SEC-004 / GRIDA-SEC-014 — native provider admission and custody.
import { AuthStore, SecretsStore } from "@grida/daemon/server";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { NativeAgentChat } from "./native-agent-chat";
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

it.runIf(sharedCustody)(
  "binds a custom key to its exact route and never selects a reserved vendor key",
  async () => {
    const home = await privateHome();
    const owner = settings();
    try {
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
      expect(selected.providerNetwork.prepare(target, headers)).toBe(
        owner.dispatch
      );
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

it.runIf(sharedCustody).each(byokProviders)(
  "binds the selected %s key to its own exact generation route",
  async (provider, endpoint) => {
    const home = await privateHome();
    const owner = settings();
    try {
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
      expect(selected.providerNetwork.prepare(route, headers)).toBe(
        owner.dispatch
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
      await store.set(provider, custom ? key : ` ${key} `);
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
      let rotatedDuringUpload = false;
      if (custom) {
        const exchange = NativeProviderEgress.prototype.exchange;
        const spy = vi
          .spyOn(NativeProviderEgress.prototype, "exchange")
          .mockImplementation(
            async function (this: NativeProviderEgress, request) {
              const reply = await exchange.call(this, request);
              if (
                (request as { action?: string })?.action === "append" &&
                !rotatedDuringUpload
              ) {
                await store.set(provider, `rotated-${key}`);
                rotatedDuringUpload = true;
              }
              return reply;
            }
          );
        restoreExchange = () => spy.mockRestore();
      } else {
        await store.set(provider, key);
      }
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
      expect(rotatedDuringUpload).toBe(custom);
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
