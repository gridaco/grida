// GRIDA-SEC-004 / GRIDA-SEC-014 — direct Gateway custody and route admission.
import { mkdtemp, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ProviderCredentialStore } from "@grida/auth/providers";
import { expect, it, vi } from "vitest";
import { ProviderNetworkPolicy } from "../provider-network-policy";
import { NativeChatProfiles } from "./native-chat-profiles";
import { NativeGatewayApiKey } from "./native-gateway-api-key";
import type { NativeProviderNetwork } from "./native-provider-egress";
import { NativeProviderRoutes } from "./native-provider-routes";

const model = {
  id: "lab/model",
  label: "Same Model",
  kind: "text",
  created: 1,
  owned_by: "lab",
  interfaces: ["chat.completions"],
  input_modalities: ["text"],
  output_modalities: ["text"],
  operation_ids: [],
  capabilities: { streaming: true, tools: true },
  limits: { max_output_tokens: 8192, context_tokens: 65536 },
};

it.skipIf(process.platform === "win32")(
  "uses the CLI's shared key with its own identity and refuses a replaced key for accepted work",
  async () => {
    const home = await mkdtemp(
      path.join(await realpath(os.tmpdir()), "grida-gg-api-key-")
    );
    try {
      const store = new ProviderCredentialStore({ home });
      const standalone = new NativeGatewayApiKey(home);
      const key = "sk-gg-v1-synthetic-fixture";
      const discover = async () => [model];
      expect((await standalone.offer(discover)).choices).toEqual([]);
      await store.set("gg", key);
      expect((await standalone.offer(async () => [])).issue).toBe(
        "noCompatibleModels"
      );
      expect(
        (
          await standalone.offer(async () => {
            throw new Error("offline");
          })
        ).issue
      ).toBe("unavailable");
      const [profile] = (await standalone.offer(discover)).choices;
      const [signedIn] = NativeChatProfiles.gatewayChoices(
        [model],
        "account-org",
        ""
      );
      expect(profile.modelId).toBe(signedIn.modelId);
      expect(profile.id).not.toBe(signedIn.id);

      const prefix = "x".repeat(127);
      const [longLabel] = (
        await standalone.offer(async () => [
          { ...model, label: `\n${prefix}😀extra text` },
        ])
      ).choices;
      expect(longLabel.id).toBe(profile.id);
      expect(longLabel.model).toBe(prefix);
      await NativeChatProfiles.remember(home, longLabel, () => {});
      expect(await NativeChatProfiles.read(home)).toEqual([
        expect.objectContaining({ id: profile.id, model: prefix }),
      ]);

      const dispatch = vi.fn<
        NonNullable<ReturnType<NativeProviderNetwork["prepare"]>>
      >(async () => new Response(null, { status: 200 }));
      const prepare = vi.fn<NativeProviderNetwork["prepare"]>(() => dispatch);
      const launch = await standalone.launch(profile, discover, async () => ({
        prepare,
      }));
      const headers = new Headers({ "content-type": "application/json" });
      expect(
        launch.providerNetwork.prepare(
          "https://grida.co/api/v1/ai/chat/completions",
          headers
        )
      ).toBeNull();
      expect(
        launch.providerNetwork.prepare(
          ProviderNetworkPolicy.GG_API_CHAT_URL,
          new Headers({
            authorization: "Bearer unexpected",
          })
        )
      ).toBeNull();

      const run = launch.providerNetwork.prepare(
        ProviderNetworkPolicy.GG_API_CHAT_URL,
        headers
      )!;
      const controller = new AbortController();
      await run(Buffer.from("{}"), controller.signal);
      expect(prepare).toHaveBeenCalledTimes(1);
      const [destination, outgoing] = prepare.mock.calls[0];
      expect(destination).toBe("https://gateway.grida.ai/v1/chat/completions");
      expect(outgoing.get("authorization")).toBe(`Bearer ${key}`);
      expect(outgoing.get("idempotency-key")).toMatch(/^[a-f0-9-]{36}$/);
      expect(headers.has("authorization")).toBe(false);
      expect(() =>
        ProviderNetworkPolicy.authorize(
          ProviderNetworkPolicy.mainOnlyGrants(),
          {
            grant_id: ProviderNetworkPolicy.GG_API_CHAT_GRANT_ID,
            method: "POST",
            url: destination,
            headers: [...outgoing],
          }
        )
      ).not.toThrow();

      const signedInLaunch = {
        model: model.id,
        provider: "openai-compatible" as const,
        endpoint: "https://grida.co/api/v1/ai",
        gatewayScope: "a".repeat(64),
        providerNetwork: { prepare: () => null },
      };
      const routes = new NativeProviderRoutes(
        signedIn.id,
        signedInLaunch,
        async (connection) => {
          if (connection === signedIn.id)
            return { prepare: async () => ({ launch: signedInLaunch }) };
          if (connection !== profile.id)
            throw new Error("unexpected connection");
          const binding = await standalone.launch(
            profile,
            discover,
            async () => ({ prepare })
          );
          return { binding, prepare: async () => ({ launch: binding }) };
        }
      );
      try {
        const direct = await routes.resolve({
          connectionId: profile.id,
          model: model.id,
        });
        const signed = await routes.resolve({
          connectionId: signedIn.id,
          model: model.id,
        });
        expect(signed.kind).toBe("launch");
        expect(direct.routeId).not.toBe(signed.routeId);
        expect(routes.get(direct.routeId)?.launch.endpoint).toBe(
          ProviderNetworkPolicy.GG_API_BASE
        );
        expect(
          await routes
            .get(direct.routeId)
            ?.launch.providerNetwork?.isCurrent?.()
        ).toBe(true);

        await store.remove("gg");
        expect(
          await routes
            .get(direct.routeId)
            ?.launch.providerNetwork?.isCurrent?.()
        ).toBe(false);
        await expect(
          routes.resolve({ connectionId: profile.id, model: model.id })
        ).rejects.toThrow("native_chat_profile_changed");
        expect(
          (await routes.resolve({ connectionId: signedIn.id, model: model.id }))
            .routeId
        ).toBe(signed.routeId);
        await store.set("gg", key);
        expect(
          (await routes.resolve({ connectionId: profile.id, model: model.id }))
            .routeId
        ).toBe(direct.routeId);
      } finally {
        routes.close();
      }

      await store.remove("gg");
      expect(await run(Buffer.from("{}"), controller.signal)).toBeNull();
      await store.set("gg", "sk-gg-v1-replacement-fixture");
      await expect(
        standalone.launch(profile, discover, async () => ({ prepare }))
      ).rejects.toThrow("native_chat_profile_changed");
      expect(prepare).toHaveBeenCalledTimes(1);
      await store.set("gg", key);
      expect((await standalone.offer(discover)).choices[0].id).toBe(profile.id);
      expect(await launch.providerNetwork.isCurrent()).toBe(true);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  }
);
