import { afterEach, describe, expect, it, vi } from "vitest";
import type { DesktopBridge } from "@grida/desktop-bridge";
import {
  BYOK_PROVIDER_METADATA,
  DESKTOP_BRIDGE_PROTOCOL,
  DesktopBridgeMissingError,
  account,
  ai,
  getDesktopBridge,
  getDesktopBridgeStatus,
  modelGeneration,
  secrets,
} from "./bridge";

function installBridge(bridge: Record<string, unknown>) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: bridge,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(globalThis, "window");
});

describe("desktop bridge client contract", () => {
  it("rejects a missing or unsupported bridge protocol", () => {
    installBridge({});
    expect(getDesktopBridge()).toBeNull();

    installBridge({ grida: { protocol: 0 } as unknown as DesktopBridge });
    expect(getDesktopBridge()).toBeNull();
    expect(getDesktopBridgeStatus()).toEqual({
      kind: "unsupported",
      protocol: 0,
    });
  });

  it("accepts the current bridge protocol", () => {
    const bridge = {
      protocol: DESKTOP_BRIDGE_PROTOCOL,
    } as unknown as DesktopBridge;
    installBridge({ grida: bridge });

    expect(getDesktopBridge()).toBe(bridge);
    expect(getDesktopBridgeStatus()).toEqual({ kind: "ready", bridge });
  });

  it("routes account sign-out only through the native entry controller", async () => {
    const signOut = vi
      .fn<NonNullable<DesktopBridge["account"]>["sign_out"]>()
      .mockResolvedValue();
    installBridge({
      grida: {
        protocol: DESKTOP_BRIDGE_PROTOCOL,
        account: { sign_out: signOut },
      } as unknown as DesktopBridge,
    });

    await account.signOut();

    expect(signOut).toHaveBeenCalledOnce();
  });

  it("fails closed when the native account controller is absent", async () => {
    installBridge({
      grida: {
        protocol: DESKTOP_BRIDGE_PROTOCOL,
      } as unknown as DesktopBridge,
    });

    await expect(account.signOut()).rejects.toBeInstanceOf(
      DesktopBridgeMissingError
    );
  });

  it("fails closed when an old host omits base64 scratch capability", () => {
    installBridge({
      grida: {
        protocol: DESKTOP_BRIDGE_PROTOCOL,
        app: { version: "999.0.0", platform: "darwin" },
        caps: { native: {} },
        agent: {
          attach_directory:
            vi.fn<NonNullable<DesktopBridge["agent"]["attach_directory"]>>(),
        },
      } as unknown as DesktopBridge,
    });

    expect(ai.supportsScratchSeedBase64(getDesktopBridge())).toBe(false);
    expect(ai.supportsScratchBinaryTools(getDesktopBridge())).toBe(false);
  });

  it("accepts base64 scratch seeds only from an explicit host capability", () => {
    installBridge({
      grida: {
        protocol: DESKTOP_BRIDGE_PROTOCOL,
        app: { version: "0.0.0", platform: "darwin" },
        caps: {
          native: {},
          agent: {
            scratch_seed_base64: true,
            scratch_binary_tools: true,
          },
        },
      } as unknown as DesktopBridge,
    });

    expect(ai.supportsScratchSeedBase64(getDesktopBridge())).toBe(true);
    expect(ai.supportsScratchBinaryTools(getDesktopBridge())).toBe(true);
  });

  it("refuses base64 scratch seeds before calling an old host", async () => {
    const run = vi.fn<DesktopBridge["agent"]["run"]>();
    installBridge({
      grida: {
        protocol: DESKTOP_BRIDGE_PROTOCOL,
        app: { version: "999.0.0", platform: "darwin" },
        caps: { native: {} },
        agent: { run },
      } as unknown as DesktopBridge,
    });

    await expect(
      ai.startAgentRun(
        {
          messages: [],
          scratch_seed: [{ path: "brief.pdf", base64: "AAAA" }],
        },
        () => {}
      )
    ).rejects.toThrow("base64 scratch seeds are not supported");
    expect(run).not.toHaveBeenCalled();
  });

  it("keeps text scratch seeds compatible with an old host", async () => {
    const run = vi.fn<DesktopBridge["agent"]["run"]>().mockResolvedValue({
      stream_id: "stream-1",
      session_id: "session-1",
      done: Promise.resolve(),
    });
    installBridge({
      grida: {
        protocol: DESKTOP_BRIDGE_PROTOCOL,
        app: { version: "0.0.7", platform: "darwin" },
        caps: { native: {} },
        agent: { run },
      } as unknown as DesktopBridge,
    });

    await expect(
      ai.startAgentRun(
        {
          messages: [],
          scratch_seed: [{ path: "template.canvas", text: "{}" }],
        },
        () => {}
      )
    ).resolves.toMatchObject({
      streamId: "stream-1",
      sessionId: "session-1",
    });
    expect(run).toHaveBeenCalledOnce();
  });

  it("forwards base64 scratch seeds when the host advertises the capability", async () => {
    const run = vi.fn<DesktopBridge["agent"]["run"]>().mockResolvedValue({
      stream_id: "stream-1",
      session_id: "session-1",
      done: Promise.resolve(),
    });
    installBridge({
      grida: {
        protocol: DESKTOP_BRIDGE_PROTOCOL,
        app: { version: "0.0.8", platform: "darwin" },
        caps: {
          native: {},
          agent: { scratch_seed_base64: true },
        },
        agent: { run },
      } as unknown as DesktopBridge,
    });
    const opts = {
      messages: [],
      scratch_seed: [{ path: "brief.pdf", base64: "AAAA" }],
    };

    await ai.startAgentRun(opts, () => {});

    expect(run).toHaveBeenCalledWith(opts, expect.any(Function));
  });

  it("uses producer-owned BYOK provider metadata for settings", () => {
    expect(secrets.byokProviderMetadata()).toBe(BYOK_PROVIDER_METADATA);
    // Media-generation providers are producer-owned and stay in catalogue order.
    expect(secrets.byokProviders()).toEqual([
      "openrouter",
      "vercel",
      "fal",
      "elevenlabs",
      "tripo",
    ]);
  });

  it("requires both the Tripo native capability and model-generation method", () => {
    const generate =
      vi.fn<NonNullable<DesktopBridge["modelGeneration"]>["generate"]>();
    const base = {
      protocol: DESKTOP_BRIDGE_PROTOCOL,
      app: { version: "999.0.0" },
    };
    for (const fields of [
      {},
      { modelGeneration: { generate } },
      { caps: { media: { tripo: true } } },
      { caps: { media: { tripo: false } }, modelGeneration: { generate } },
    ]) {
      installBridge({ grida: { ...base, ...fields } });
      expect(modelGeneration.isSupported()).toBe(false);
    }
    installBridge({
      grida: {
        ...base,
        caps: { media: { tripo: true } },
        modelGeneration: { generate },
      },
    });
    expect(modelGeneration.isSupported()).toBe(true);
  });

  it("refuses model generation on an old host before sending its new wire", async () => {
    const generate =
      vi.fn<NonNullable<DesktopBridge["modelGeneration"]>["generate"]>();
    installBridge({
      grida: {
        protocol: DESKTOP_BRIDGE_PROTOCOL,
        modelGeneration: { generate },
      },
    });
    await expect(
      modelGeneration.generate({
        model_id: "tripo/h3.1",
        provider: "tripo",
        variant: "text",
        input: { prompt: "Chair" },
      })
    ).rejects.toBeInstanceOf(DesktopBridgeMissingError);
    expect(generate).not.toHaveBeenCalled();
  });

  it("forwards the feature request through a compatible native bridge", async () => {
    const result = {
      feature: "model-generation",
      model_id: "tripo/h3.1",
      provider_id: "tripo",
      variant: "text",
      glb: {
        base64: "Z2xURg==",
        media_type: "model/gltf-binary",
        file_name: "model.glb",
      },
      task: { id: "test-task" },
    } as const;
    const generate = vi
      .fn<NonNullable<DesktopBridge["modelGeneration"]>["generate"]>()
      .mockResolvedValue(result);
    installBridge({
      grida: {
        protocol: DESKTOP_BRIDGE_PROTOCOL,
        caps: { media: { tripo: true } },
        modelGeneration: { generate },
      },
    });
    const request = {
      model_id: "tripo/h3.1",
      provider: "tripo",
      variant: "text",
      input: { prompt: "Chair" },
    } as const;
    await expect(modelGeneration.generate(request)).resolves.toEqual(result);
    expect(generate).toHaveBeenCalledWith(request);
  });

  it("rejects empty keys before calling the bridge", async () => {
    const set = vi.fn<DesktopBridge["secrets"]["set"]>();
    installBridge({
      grida: {
        protocol: DESKTOP_BRIDGE_PROTOCOL,
        secrets: { set },
      } as unknown as DesktopBridge,
    });

    await expect(secrets.setKey("openrouter", "   ")).rejects.toThrow(
      "Key cannot be empty."
    );
    expect(set).not.toHaveBeenCalled();
  });

  it("confirms deletes through the destructive native dialog", async () => {
    const confirm = vi
      .fn<DesktopBridge["dialog"]["confirm"]>()
      .mockResolvedValue(0);
    installBridge({
      grida: {
        protocol: DESKTOP_BRIDGE_PROTOCOL,
        dialog: { confirm },
      } as unknown as DesktopBridge,
    });

    await expect(secrets.confirmDeleteKey("openrouter")).resolves.toBe(true);
    expect(confirm).toHaveBeenCalledWith({
      message: "Remove OpenRouter key?",
      detail:
        "The desktop app will stop using this key. You can add it back any time.",
      buttons: ["Remove", "Cancel"],
      default_id: 1,
      cancel_id: 1,
    });
  });

  it("does not expose a secret read path", () => {
    expect("get" in secrets).toBe(false);
  });
});
