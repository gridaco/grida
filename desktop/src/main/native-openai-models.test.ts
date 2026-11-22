// GRIDA-SEC-004 / GRIDA-SEC-014 — discovery uses current project custody only.
import { OPENAI_PROJECT_PROVIDER_ID } from "@grida/ai/providers";
import { ProviderCredentialStore } from "@grida/auth/providers";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { NativeOpenAiModels } from "./native-openai-models";
import type { NativeProviderNetwork } from "./native-provider-egress";

it.runIf(process.platform !== "win32")(
  "uses the project key for one shared lookup and ignores the legacy slot",
  async () => {
    const f = await fixture();
    try {
      await f.store.set("openai", "legacy-key");
      expect(await f.models.offer()).toEqual({ status: "missing" });
      expect(f.getModels).not.toHaveBeenCalled();
      await f.store.set(OPENAI_PROJECT_PROVIDER_ID, "project-key");
      const offers = await Promise.all([f.models.offer(), f.models.offer()]);
      expect(offers).toEqual(
        Array(2).fill(
          expect.objectContaining({
            status: "ready",
            models: new Set(["gpt-fixture"]),
          })
        )
      );
      expect(f.getModels).toHaveBeenCalledTimes(1);
      expect(f.getModels.mock.calls[0]![0].get("authorization")).toBe(
        "Bearer project-key"
      );
    } finally {
      await f.close();
    }
  }
);

it.runIf(process.platform !== "win32")(
  "returns loading for catalogue readers while a selected OpenAI profile waits on the same lookup",
  async () => {
    const f = await fixture();
    const inFlight = Promise.withResolvers<Response>();
    try {
      await f.store.set(OPENAI_PROJECT_PROVIDER_ID, "project-key");
      f.getModels.mockReturnValueOnce(inFlight.promise);
      expect(await f.models.offer(false)).toEqual({ status: "loading" });
      const selected = f.models.offer();
      expect(await f.models.offer(false)).toEqual({ status: "loading" });
      inFlight.resolve(
        Response.json({ object: "list", data: [{ id: "gpt-fixture" }] })
      );
      const ready = await selected;
      expect(ready).toMatchObject({
        status: "ready",
        models: new Set(["gpt-fixture"]),
      });
      expect(await f.models.offer(false)).toBe(ready);
      expect(f.getModels).toHaveBeenCalledTimes(1);
    } finally {
      inFlight.resolve(new Response(null, { status: 503 }));
      await f.close();
    }
  }
);

it.runIf(process.platform !== "win32")(
  "times out pending network setup before allowing a provider request",
  async () => {
    const starting = Promise.withResolvers<void>();
    const network = Promise.withResolvers<NativeProviderNetwork>();
    const f = await fixture(() => {
      starting.resolve();
      return network.promise;
    });
    try {
      await f.store.set(OPENAI_PROJECT_PROVIDER_ID, "project-key");
      vi.useFakeTimers();
      const offer = f.models.offer();
      await starting.promise;
      await vi.advanceTimersByTimeAsync(5_000);
      expect(await offer).toEqual({ status: "unavailable" });
      network.resolve({ getOpenAiModels: f.getModels, prepare: () => null });
      await network.promise;
      expect(f.getModels).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      network.resolve({ prepare: () => null });
      await f.close();
    }
  }
);

it.runIf(process.platform !== "win32")(
  "discards in-flight results on rotation and distinguishes discovery outcomes",
  async () => {
    const f = await fixture();
    const started = Promise.withResolvers<void>();
    const inFlight = Promise.withResolvers<Response>();
    try {
      await f.store.set(OPENAI_PROJECT_PROVIDER_ID, "original-key");
      f.getModels.mockImplementationOnce(() => {
        started.resolve();
        return inFlight.promise;
      });
      const pending = f.models.offer();
      await started.promise;
      await f.store.set(OPENAI_PROJECT_PROVIDER_ID, "replacement-key");
      inFlight.resolve(
        Response.json({ object: "list", data: [{ id: "old-model" }] })
      );
      expect(await pending).toEqual({ status: "unavailable" });

      for (const [code, status] of [
        [401, "keyRejected"],
        [403, "modelsForbidden"],
        [503, "unavailable"],
      ] as const) {
        f.models.invalidate();
        f.getModels.mockResolvedValueOnce(new Response(null, { status: code }));
        expect(await f.models.offer()).toEqual({ status });
        expect(f.getModels.mock.lastCall![0].get("authorization")).toBe(
          "Bearer replacement-key"
        );
      }
      f.models.invalidate();
      f.getModels.mockResolvedValueOnce(
        Response.json({ object: "list", data: [] })
      );
      const empty = await f.models.offer();
      expect(empty.status).toBe("ready");
      if (empty.status !== "ready")
        throw new Error("expected a valid empty model list");
      expect(empty.models.size).toBe(0);
      await f.store.remove(OPENAI_PROJECT_PROVIDER_ID);
      expect(await empty.isCurrent()).toBe(false);
      expect(await f.models.offer()).toEqual({ status: "missing" });
    } finally {
      inFlight.resolve(new Response(null, { status: 503 }));
      await f.close();
    }
  }
);

async function fixture(network?: () => Promise<NativeProviderNetwork>) {
  const home = await fs.mkdtemp(
    path.join(await fs.realpath(os.tmpdir()), "grida-openai-")
  );
  const store = new ProviderCredentialStore({ home });
  const getModels = vi.fn<
    NonNullable<NativeProviderNetwork["getOpenAiModels"]>
  >(async () =>
    Response.json({
      object: "list",
      data: [{ id: "gpt-fixture" }, { id: "invalid id" }],
    })
  );
  const models = new NativeOpenAiModels(
    home,
    network ??
      (async () => ({
        getOpenAiModels: getModels,
        prepare: () => null,
      }))
  );
  return {
    store,
    models,
    getModels,
    close: () => fs.rm(home, { recursive: true, force: true }),
  };
}
