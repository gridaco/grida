// GRIDA-SEC-004 / GRIDA-SEC-008 / GRIDA-SEC-014 — native provider composition on Windows.
// GRIDA-SEC-006 — optional BYOK discovery must not block an existing GG grant.
// GRIDA-GG: provider — strict native custody keeps automatic payer selection honest.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthStore,
  SecretsStore,
  WorkspaceRegistry,
} from "@grida/daemon/server";
import { resolveProvider } from "./index";
import { hasUsableImageProvider } from "./resolve-image";
import { GridaGatewaySessionStore } from "./gg-session";
import { createWorkspaceAgentBindings } from "../runtime/workspace-agent-bindings";
import type { ChatGptProviderRuntime } from "./chatgpt";
import type { ChatGptCredentialManager } from "./chatgpt-credentials";

// The actual native owners and package seam run against owned synthetic files;
// only OS selection and ChatGPT account readiness are simulated. No paid calls.
describe.skipIf(!["darwin", "linux"].includes(process.platform))(
  "Windows provider custody composition",
  () => {
    let root: string;
    let state: string;
    let workspace: string;
    let scratch: string;
    let registry: WorkspaceRegistry;
    let secrets: SecretsStore;
    let gg: GridaGatewaySessionStore;
    const chatgpt: ChatGptProviderRuntime = {
      config: {
        oauth: {
          authorize_url: "https://auth.example.test/oauth/authorize",
          token_url: "https://auth.example.test/oauth/token",
          client_id: "grida-synthetic-client",
          redirect_uris: ["http://localhost:1455/auth/callback"],
          scopes: ["openid", "offline_access"],
        },
        responses_url:
          "https://chatgpt.example.test/backend-api/agent/responses",
        originator: "grida-test",
        default_model_id: "openai/gpt-5.6-terra",
      },
      credentials: {
        supportsAccount: async () => true,
      } as unknown as ChatGptCredentialManager,
    };

    beforeEach(async () => {
      root = await fs.realpath(
        await fs.mkdtemp(path.join(os.tmpdir(), "grida-windows-provider-"))
      );
      state = path.join(root, "agent");
      workspace = path.join(root, "workspace");
      scratch = path.join(root, "scratch");
      await Promise.all([state, workspace, scratch].map((p) => fs.mkdir(p)));
      registry = new WorkspaceRegistry(state);
      await registry.open(workspace);
      vi.spyOn(process, "platform", "get").mockReturnValue("win32");
      secrets = new SecretsStore(
        new AuthStore(state),
        path.join(root, "providers-home")
      );
      gg = new GridaGatewaySessionStore();
      gg.set({
        access_token: "synthetic-token",
        expires_at: Date.now() + 900_000,
      });
      vi.spyOn(globalThis, "fetch").mockRejectedValue(
        new Error("Provider requests are forbidden in this test")
      );
    });

    afterEach(async () => {
      vi.restoreAllMocks();
      await fs.rm(root, { recursive: true, force: true });
    });

    function deps() {
      return { secrets, gg, gg_base_url: "https://grida.test" };
    }

    function workspaceBindings() {
      return createWorkspaceAgentBindings(
        { workspace_root: workspace, mode: "auto" },
        {
          ...deps(),
          workspace_registry: registry,
          scratch_dir: scratch,
          image_gen_enabled: true,
        }
      );
    }

    it("resolves keyless automatic GG and optional workspace image tools", async () => {
      expect(await resolveProvider(deps())).toMatchObject({
        provider_id: "gg",
      });
      expect(await hasUsableImageProvider(deps())).toBe(true);
      expect((await workspaceBindings())?.image_gen).toBeDefined();
      await expect(
        fs.stat(path.join(root, "providers-home"))
      ).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it.each(["gg", "chatgpt"])(
      "keeps explicit %s usable when optional image tools inspect BYOK",
      async (provider) => {
        expect(
          await resolveProvider(
            { ...deps(), chatgpt },
            { explicit: provider, model_id: "openai/gpt-5.6-terra" }
          )
        ).toMatchObject({ provider_id: provider });
        expect((await workspaceBindings())?.image_gen).toBeDefined();
        expect(globalThis.fetch).not.toHaveBeenCalled();
      }
    );

    it("retains the existing BYOK priority and explicit-provider availability", async () => {
      await secrets.set("openrouter", "synthetic-openrouter-key");
      expect(await resolveProvider(deps())).toMatchObject({
        provider_id: "openrouter",
        kind: "byok",
      });
      expect(
        await resolveProvider(deps(), { explicit: "openrouter" })
      ).toMatchObject({
        provider_id: "openrouter",
      });
      await secrets.delete("openrouter");
      await expect(
        resolveProvider(deps(), { explicit: "openrouter" })
      ).rejects.toMatchObject({
        code: "provider_down",
      });
      expect(await resolveProvider(deps())).toMatchObject({
        provider_id: "gg",
      });
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("rejects corrupt BYOK custody without automatically switching the payer to GG", async () => {
      await fs.writeFile(
        path.join(state, "auth.json"),
        "synthetic invalid JSON",
        {
          mode: 0o600,
        }
      );
      await expect(resolveProvider(deps())).rejects.toMatchObject({
        code: "storage_failed",
      });
      await expect(hasUsableImageProvider(deps())).rejects.toMatchObject({
        code: "storage_failed",
      });
      await expect(workspaceBindings()).rejects.toMatchObject({
        code: "storage_failed",
      });
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  }
);
