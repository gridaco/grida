import { afterEach, describe, expect, it, vi } from "vitest";
import type { DesktopBridge } from "@grida/desktop-bridge";
import { OPENAI_PROJECT_PROVIDER_ID } from "@grida/ai-host";
import {
  BYOK_PROVIDER_METADATA,
  DESKTOP_BRIDGE_PROTOCOL,
  DesktopBridgeMissingError,
  account,
  app,
  getDesktopBridge,
  getDesktopBridgeStatus,
  modelGeneration,
  providers,
  rigging,
  secrets,
  workspaces,
} from "./bridge";

function installBridge(bridge: Record<string, unknown>) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: bridge,
  });
}

type ReadWorkspaceSvg = NonNullable<
  DesktopBridge["workspaces"]["read_svg_document"]
>;
type ReadWorkspaceText = DesktopBridge["workspaces"]["read_file"];

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(globalThis, "window");
});

describe("desktop bridge client contract", () => {
  it("reads SVG documents through the optional host method while generic text keeps its own reader", async () => {
    const svg = { content: "<svg/>", mtime: 123 };
    const readSvg = vi.fn<ReadWorkspaceSvg>().mockResolvedValue(svg);
    const readText = vi
      .fn<ReadWorkspaceText>()
      .mockResolvedValue({ content: "text", mtime: 456 });
    installBridge({
      grida: {
        protocol: DESKTOP_BRIDGE_PROTOCOL,
        workspaces: { read_svg_document: readSvg, read_file: readText },
      },
    });

    expect(workspaces.supportsSvgDocumentReads()).toBe(true);
    await expect(
      workspaces.readSvgDocument("workspace", "slides/cover.SVG")
    ).resolves.toEqual(svg);
    expect(readSvg).toHaveBeenCalledExactlyOnceWith(
      "workspace",
      "slides/cover.SVG"
    );
    await workspaces.readFile("workspace", "slides/cover.SVG");
    await workspaces.readSvgDocument("workspace", "slides/custom-extension");
    expect(readText.mock.calls).toEqual([
      ["workspace", "slides/cover.SVG"],
      ["workspace", "slides/custom-extension"],
    ]);
  });

  it("uses the legacy text reader when the host lacks SVG document reads", async () => {
    const svg = { content: "<svg/>", mtime: 123 };
    const readText = vi.fn<ReadWorkspaceText>().mockResolvedValue(svg);
    installBridge({
      grida: {
        protocol: DESKTOP_BRIDGE_PROTOCOL,
        workspaces: { read_file: readText },
      },
    });

    expect(workspaces.supportsSvgDocumentReads()).toBe(false);
    await expect(
      workspaces.readSvgDocument("workspace", "cover.svg")
    ).resolves.toEqual(svg);
    expect(readText).toHaveBeenCalledExactlyOnceWith("workspace", "cover.svg");
  });

  it("surfaces the SVG filename and exact size and limit without retrying", async () => {
    const maxSize = 8 * 1024 * 1024;
    const readSvg = vi.fn<ReadWorkspaceSvg>().mockResolvedValue({
      error: "file-too-large",
      size: maxSize + 1,
      max_size: maxSize,
    });
    const readText = vi.fn<ReadWorkspaceText>();
    installBridge({
      grida: {
        protocol: DESKTOP_BRIDGE_PROTOCOL,
        workspaces: { read_svg_document: readSvg, read_file: readText },
      },
    });

    const number = new Intl.NumberFormat();
    await expect(
      workspaces.readSvgDocument("workspace", "slides/cover.svg")
    ).rejects.toThrow(
      `“cover.svg” is ${number.format(maxSize + 1)} bytes. The SVG document limit is 8 MiB (${number.format(maxSize)} bytes).`
    );
    expect(readText).not.toHaveBeenCalled();
  });

  it("uses the optional consent query and detected-model update without falling back to Save", async () => {
    const authorization = vi
      .fn<
        NonNullable<
          NonNullable<DesktopBridge["providers"]>["endpoint_authorization"]
        >
      >()
      .mockResolvedValue(true);
    const update = vi
      .fn<
        NonNullable<
          NonNullable<DesktopBridge["providers"]>["update_endpoint_models"]
        >
      >()
      .mockResolvedValue(undefined);
    const save =
      vi.fn<NonNullable<DesktopBridge["providers"]>["set_endpoint"]>();
    installBridge({
      grida: {
        protocol: DESKTOP_BRIDGE_PROTOCOL,
        providers: {
          endpoint_authorization: authorization,
          update_endpoint_models: update,
          set_endpoint: save,
        },
      },
    });
    expect(providers.supportsEndpointConsent()).toBe(true);
    await expect(
      providers.endpointAuthorization("ollama", "http://localhost:11434/v1")
    ).resolves.toBe(true);
    const facts = {
      id: "ollama",
      base_url: "http://localhost:11434/v1",
      models: [{ id: "local-model" }],
    };
    await providers.updateEndpointModels(facts);
    expect(authorization).toHaveBeenCalledExactlyOnceWith(
      facts.id,
      facts.base_url
    );
    expect(update).toHaveBeenCalledExactlyOnceWith(facts);
    expect(save).not.toHaveBeenCalled();
  });

  it("refuses new consent operations on a legacy host instead of invoking its modal Save", async () => {
    const save =
      vi.fn<NonNullable<DesktopBridge["providers"]>["set_endpoint"]>();
    installBridge({
      grida: {
        protocol: DESKTOP_BRIDGE_PROTOCOL,
        providers: { set_endpoint: save },
      },
    });
    expect(providers.supportsEndpointConsent()).toBe(false);
    await expect(
      providers.endpointAuthorization("ollama", "http://localhost:11434/v1")
    ).rejects.toBeInstanceOf(DesktopBridgeMissingError);
    await expect(
      providers.updateEndpointModels({
        id: "ollama",
        base_url: "http://localhost:11434/v1",
        models: [],
      })
    ).rejects.toBeInstanceOf(DesktopBridgeMissingError);
    expect(save).not.toHaveBeenCalled();
  });

  it("shows direct OpenAI image bindings only when the host exposes image generation for the project key", async () => {
    const direct = { text: true as const };
    const mixed = {
      id: "mixed-image",
      label: "Mixed image",
      providers: { fal: direct, [OPENAI_PROJECT_PROVIDER_ID]: direct },
    };
    const openAiOnly = {
      id: "openai-image",
      label: "OpenAI image",
      providers: { [OPENAI_PROJECT_PROVIDER_ID]: direct },
    };
    const catalogue = {
      version: "current",
      image: [mixed, openAiOnly],
      video: [{ id: "video", label: "Video", providers: { fal: direct } }],
    };
    const read = async () => catalogue;
    for (const openai_images of [false, undefined]) {
      installBridge({
        grida: {
          protocol: DESKTOP_BRIDGE_PROTOCOL,
          caps: { native: { openai_api: true }, media: { openai_images } },
          providers: { visual_models: read },
        },
      });
      expect(providers.supportsOpenAiImages()).toBe(false);
      await expect(providers.visualModels()).resolves.toEqual({
        ...catalogue,
        image: [{ ...mixed, providers: { fal: direct } }],
      });
    }
    installBridge({
      grida: {
        protocol: DESKTOP_BRIDGE_PROTOCOL,
        caps: { media: { openai_images: true } },
        providers: { visual_models: read },
      },
    });
    expect(providers.supportsOpenAiImages()).toBe(true);
    await expect(providers.visualModels()).resolves.toBe(catalogue);
  });

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

  it("opens Settings through the optional native window action without route arguments", async () => {
    const open = vi.fn<() => Promise<void>>().mockResolvedValue();
    installBridge({
      grida: {
        protocol: DESKTOP_BRIDGE_PROTOCOL,
        window: { open_settings: open },
      },
    });
    await app.openSettings();
    expect(open).toHaveBeenCalledExactlyOnceWith();
  });

  it("opens LLM Providers through the focused native action when available", async () => {
    const open = vi.fn<() => Promise<void>>().mockResolvedValue();
    const openProviders = vi.fn<() => Promise<void>>().mockResolvedValue();
    installBridge({
      grida: {
        protocol: DESKTOP_BRIDGE_PROTOCOL,
        window: {
          open_settings: open,
          open_llm_provider_settings: openProviders,
        },
      },
    });
    await app.openSettings("models");
    expect(openProviders).toHaveBeenCalledExactlyOnceWith();
    expect(open).not.toHaveBeenCalled();
  });

  it("opens general Settings when an older build cannot target LLM Providers", async () => {
    const open = vi.fn<() => Promise<void>>().mockResolvedValue();
    installBridge({
      grida: {
        protocol: DESKTOP_BRIDGE_PROTOCOL,
        window: { open_settings: open },
      },
    });
    await app.openSettings("models");
    expect(open).toHaveBeenCalledExactlyOnceWith();
  });

  it("refuses Settings window requests on older native hosts", async () => {
    installBridge({
      grida: { protocol: DESKTOP_BRIDGE_PROTOCOL, window: {} },
    });
    await expect(app.openSettings()).rejects.toBeInstanceOf(
      DesktopBridgeMissingError
    );
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

  it("uses producer-owned BYOK provider metadata for settings", () => {
    expect(secrets.byokProviderMetadata()).toBe(BYOK_PROVIDER_METADATA);
    // Media-generation providers are producer-owned and stay in catalogue order.
    expect(secrets.byokProviders()).toEqual([
      "openrouter",
      "vercel",
      "fal",
      "elevenlabs",
      "tripo",
      OPENAI_PROJECT_PROVIDER_ID,
    ]);
  });

  it("requires rigging readiness and both methods before emitting either request", async () => {
    const check = vi.fn<NonNullable<DesktopBridge["rigging"]>["check"]>();
    const generate = vi.fn<NonNullable<DesktopBridge["rigging"]>["generate"]>();
    const request = {
      provider: "tripo",
      input: { mesh: { data: "AQID", media_type: "model/gltf-binary" } },
    } as const;
    for (const fields of [
      {},
      { caps: { media: { tripo: true } }, rigging: { check, generate } },
      { caps: { media: { rigging: true } }, rigging: { check } },
      { caps: { media: { rigging: true } }, rigging: { generate } },
      { caps: { media: { rigging: false } }, rigging: { check, generate } },
    ]) {
      installBridge({
        grida: { protocol: DESKTOP_BRIDGE_PROTOCOL, ...fields },
      });
      expect(rigging.isSupported()).toBe(false);
      await expect(rigging.check(request)).rejects.toBeInstanceOf(
        DesktopBridgeMissingError
      );
      await expect(
        rigging.generate({
          ...request,
          model_id: "tripo/rig-v1.0",
          input: { ...request.input, rig_type: "biped", spec: "mixamo" },
        })
      ).rejects.toBeInstanceOf(DesktopBridgeMissingError);
    }
    expect(check).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    const findings = {
      feature: "rig-check",
      provider_id: "tripo",
      riggable: false,
      rig_type: "biped",
      task: { id: "task_check" },
    } as const;
    check.mockResolvedValue(findings);
    installBridge({
      grida: {
        protocol: DESKTOP_BRIDGE_PROTOCOL,
        caps: { media: { rigging: true } },
        rigging: { check, generate },
      },
    });
    expect(rigging.isSupported()).toBe(true);
    await expect(rigging.check(request)).resolves.toEqual(findings);
    expect(check).toHaveBeenCalledWith(request);
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

  // GRIDA-GG: desktop — generic GG plus BYOK methods is not funded Tripo support.
  it("refuses funded Tripo requests on old hosts and requires each explicit capability", async () => {
    const generate =
      vi.fn<NonNullable<DesktopBridge["modelGeneration"]>["generate"]>();
    const check = vi.fn<NonNullable<DesktopBridge["rigging"]>["check"]>();
    const rig = vi.fn<NonNullable<DesktopBridge["rigging"]>["generate"]>();
    const generationRequest = {
      provider: "gg",
      model_id: "tripo/h3.1",
      variant: "text",
      input: { prompt: "Chair" },
    } as const;
    const checkRequest = {
      provider: "gg",
      input: { mesh: { data: "AAAA", media_type: "model/gltf-binary" } },
    } as const;
    const rigRequest = {
      ...checkRequest,
      model_id: "tripo/rig-v1.0",
      input: { ...checkRequest.input, rig_type: "biped", spec: "mixamo" },
    } as const;
    const base = {
      protocol: DESKTOP_BRIDGE_PROTOCOL,
      modelGeneration: { generate },
      rigging: { check, generate: rig },
    };
    for (const fields of [
      { gg: {}, caps: { media: { tripo: true, rigging: true } } },
      {
        gg: {},
        caps: {
          media: {
            tripo: true,
            rigging: true,
            tripo_gg: false,
            rigging_gg: false,
          },
        },
      },
      {
        caps: {
          media: {
            tripo: true,
            rigging: true,
            tripo_gg: true,
            rigging_gg: true,
          },
        },
      },
    ]) {
      installBridge({ grida: { ...base, ...fields } });
      expect(modelGeneration.isGgSupported()).toBe(false);
      expect(rigging.isGgSupported()).toBe(false);
      await expect(
        modelGeneration.generate(generationRequest)
      ).rejects.toBeInstanceOf(DesktopBridgeMissingError);
      await expect(rigging.check(checkRequest)).rejects.toBeInstanceOf(
        DesktopBridgeMissingError
      );
      await expect(rigging.generate(rigRequest)).rejects.toBeInstanceOf(
        DesktopBridgeMissingError
      );
    }
    expect(generate).not.toHaveBeenCalled();
    expect(check).not.toHaveBeenCalled();
    expect(rig).not.toHaveBeenCalled();
    installBridge({
      grida: {
        ...base,
        gg: {},
        caps: {
          media: {
            tripo: true,
            rigging: true,
            tripo_gg: true,
            rigging_gg: true,
          },
        },
      },
    });
    expect(modelGeneration.isGgSupported()).toBe(true);
    expect(rigging.isGgSupported()).toBe(true);
    await modelGeneration.generate(generationRequest);
    await rigging.check(checkRequest);
    await rigging.generate(rigRequest);
    expect(generate).toHaveBeenCalledWith(generationRequest);
    expect(check).toHaveBeenCalledWith(checkRequest);
    expect(rig).toHaveBeenCalledWith(rigRequest);
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
