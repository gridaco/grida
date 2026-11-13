// GRIDA-SEC-004 / GRIDA-SEC-014 — media provider custody composition on Windows.
// GRIDA-SEC-006 — optional BYOK discovery must not block an existing GG grant.
// GRIDA-GG: provider — strict native custody keeps automatic payer selection honest.
import { ggMediaDiscoveryFixture } from "./gg-discovery.fixture";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthStore, SecretsStore } from "@grida/daemon/server";
import { resolveImageModel } from "./resolve-image";
import { GridaGatewaySessionStore } from "./gg-session";

// The actual native owners and package seam run against owned synthetic files;
// only OS selection is simulated. No paid calls.
describe.skipIf(!["darwin", "linux"].includes(process.platform))(
  "Windows provider custody composition",
  () => {
    let root: string;
    let state: string;
    let secrets: SecretsStore;
    let gg: GridaGatewaySessionStore;
    beforeEach(async () => {
      root = await fs.realpath(
        await fs.mkdtemp(path.join(os.tmpdir(), "grida-windows-provider-"))
      );
      state = path.join(root, "agent");
      await fs.mkdir(state);
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
      return {
        secrets,
        gg,
        gg_base_url: "https://grida.test",
        gg_catalog: ggMediaDiscoveryFixture([
          { id: "openai/gpt-image-2", kind: "image" },
        ]),
      };
    }

    it("resolves keyless automatic GG image generation without creating a provider home", async () => {
      expect(
        await resolveImageModel(deps(), "openai/gpt-image-2")
      ).toMatchObject({ provider_id: "gg" });
      await expect(
        fs.stat(path.join(root, "providers-home"))
      ).rejects.toMatchObject({
        code: "ENOENT",
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
      // The image operation reports only its safe failure code; it must not
      // fall through to the hosted payer.
      await expect(
        resolveImageModel(deps(), "openai/gpt-image-2")
      ).rejects.toMatchObject({
        code: "generation_failed",
      });
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  }
);
