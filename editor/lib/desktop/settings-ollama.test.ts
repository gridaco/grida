import { describe, expect, it, vi } from "vitest";
import {
  OLLAMA_ENDPOINT_PRESET,
  mergeProbedModels,
  type EndpointProviderConfig,
} from "./bridge";
import { SettingsOllama } from "./settings-ollama";

const endpoint: EndpointProviderConfig = {
  ...OLLAMA_ENDPOINT_PRESET,
  models: [{ id: "local-model", overrides: { contextWindow: 8192 } }],
};
function fixture(
  options: { saved?: boolean; consent?: boolean; modern?: boolean } = {}
) {
  let saved = options.saved === false ? null : structuredClone(endpoint);
  let consent = options.consent === false ? null : (saved?.base_url ?? null);
  const api: SettingsOllama.API = {
    isSupported: vi.fn<SettingsOllama.API["isSupported"]>(() => true),
    supportsEndpointConsent: vi.fn<
      SettingsOllama.API["supportsEndpointConsent"]
    >(() => options.modern !== false),
    listEndpoints: vi.fn<SettingsOllama.API["listEndpoints"]>(async () =>
      saved ? [structuredClone(saved)] : []
    ),
    endpointAuthorization: vi.fn<SettingsOllama.API["endpointAuthorization"]>(
      async (_id, url) => consent === url
    ),
    setEndpoint: vi.fn<SettingsOllama.API["setEndpoint"]>(async (config) => {
      saved = structuredClone(config);
      consent = config.base_url;
    }),
    probeEndpoint: vi.fn<SettingsOllama.API["probeEndpoint"]>(async () => ({
      source: "ollama" as const,
      models: [{ id: "local-model", contextWindow: 32000 }],
    })),
    updateEndpointModels: vi.fn<SettingsOllama.API["updateEndpointModels"]>(
      async (update) => {
        if (!saved || saved.base_url !== update.base_url)
          throw new Error("destination changed");
        saved = {
          ...saved,
          models: mergeProbedModels(saved.models, update.models).models,
        };
      }
    ),
    deleteEndpoint: vi.fn<SettingsOllama.API["deleteEndpoint"]>(async () => {
      saved = null;
      consent = null;
    }),
    confirmDeleteEndpoint: vi.fn<SettingsOllama.API["confirmDeleteEndpoint"]>(
      async () => true
    ),
  };
  return { api, controller: new SettingsOllama.Controller(api) };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("SettingsOllama.Controller", () => {
  it("reuses saved consent for background discovery and writes only detected facts", async () => {
    const { api, controller } = fixture();
    await controller.refresh();
    expect(api.endpointAuthorization).toHaveBeenCalledExactlyOnceWith(
      endpoint.id,
      endpoint.base_url
    );
    expect(api.probeEndpoint).toHaveBeenCalledExactlyOnceWith(
      endpoint.base_url
    );
    expect(api.updateEndpointModels).toHaveBeenCalledExactlyOnceWith({
      id: endpoint.id,
      base_url: endpoint.base_url,
      models: [{ id: "local-model", contextWindow: 32000 }],
    });
    expect(api.setEndpoint).not.toHaveBeenCalled();
    expect(controller.read().draft?.models[0].overrides).toEqual({
      contextWindow: 8192,
    });
    expect(controller.read().dirty).toBe(false);
  });

  it("offers reconnection for an unchanged saved config without probing or consenting on mount", async () => {
    const { api, controller } = fixture({ consent: false });
    await controller.refresh();
    expect(controller.read().dirty).toBe(false);
    expect(SettingsOllama.needsConnection(controller.read())).toBe(true);
    expect(api.probeEndpoint).not.toHaveBeenCalled();
    expect(api.setEndpoint).not.toHaveBeenCalled();
    await controller.save();
    expect(api.setEndpoint).toHaveBeenCalledOnce();
    expect(SettingsOllama.needsConnection(controller.read())).toBe(false);
    expect(api.probeEndpoint).toHaveBeenCalledOnce();
  });

  it("shows the setup draft before Connect performs any endpoint requests", async () => {
    const { api, controller } = fixture({ saved: false });
    await controller.refresh();
    controller.setup();
    expect(controller.read().draft?.base_url).toBe(
      OLLAMA_ENDPOINT_PRESET.base_url
    );
    await controller.detect();
    expect(api.probeEndpoint).not.toHaveBeenCalled();
    expect(api.setEndpoint).not.toHaveBeenCalled();
    await controller.save();
    expect(api.setEndpoint).toHaveBeenCalledOnce();
    expect(api.probeEndpoint).toHaveBeenCalledOnce();
    expect(controller.read().persisted).toBe(true);
  });

  it("withholds discovery at an edited address until explicit Save", async () => {
    const { api, controller } = fixture();
    await controller.refresh();
    vi.mocked(api.probeEndpoint).mockClear();
    const changed = {
      ...controller.read().draft!,
      base_url: "http://127.0.0.1:11435/v1",
    };
    controller.edit(changed);
    await controller.detect();
    expect(api.probeEndpoint).not.toHaveBeenCalled();
    expect(SettingsOllama.needsConnection(controller.read())).toBe(true);
    await controller.save();
    expect(api.setEndpoint).toHaveBeenCalledExactlyOnceWith(changed);
    expect(api.probeEndpoint).toHaveBeenCalledExactlyOnceWith(changed.base_url);
  });

  it("does not invoke legacy modal probes when Settings is visited", async () => {
    const { api, controller } = fixture({ modern: false });
    await controller.refresh();
    expect(api.endpointAuthorization).not.toHaveBeenCalled();
    expect(api.probeEndpoint).not.toHaveBeenCalled();
    await controller.detect();
    expect(api.probeEndpoint).toHaveBeenCalledOnce();
    expect(api.setEndpoint).not.toHaveBeenCalled();
    expect(api.updateEndpointModels).not.toHaveBeenCalled();
    expect(controller.read().dirty).toBe(true);
  });

  it("keeps discovery on a dirty draft local instead of persisting unsaved choices", async () => {
    const { api, controller } = fixture();
    await controller.refresh();
    vi.mocked(api.updateEndpointModels).mockClear();
    controller.edit({ ...controller.read().draft!, label: "Unsaved label" });
    vi.mocked(api.probeEndpoint).mockResolvedValueOnce({
      source: "ollama",
      models: [{ id: "new-model" }],
    });
    await controller.detect();
    expect(controller.read().draft?.label).toBe("Unsaved label");
    expect(controller.read().draft?.models.map((model) => model.id)).toContain(
      "new-model"
    );
    expect(controller.read().dirty).toBe(true);
    expect(api.updateEndpointModels).not.toHaveBeenCalled();
    expect(api.setEndpoint).not.toHaveBeenCalled();
  });

  it("drops a discovery result after an edit without overwriting the draft", async () => {
    const { api, controller } = fixture();
    await controller.refresh();
    vi.mocked(api.updateEndpointModels).mockClear();
    const result =
      deferred<Awaited<ReturnType<SettingsOllama.API["probeEndpoint"]>>>();
    vi.mocked(api.probeEndpoint).mockReturnValueOnce(result.promise);
    const running = controller.detect();
    controller.edit({ ...controller.read().draft!, label: "New label" });
    result.resolve({ source: "ollama", models: [{ id: "late-model" }] });
    await running;
    expect(controller.read().draft?.label).toBe("New label");
    expect(
      controller.read().draft?.models.map((model) => model.id)
    ).not.toContain("late-model");
    expect(api.updateEndpointModels).not.toHaveBeenCalled();
  });

  it("cannot resurrect a removed endpoint when an earlier discovery finishes", async () => {
    const { api, controller } = fixture();
    await controller.refresh();
    vi.mocked(api.updateEndpointModels).mockClear();
    const result =
      deferred<Awaited<ReturnType<SettingsOllama.API["probeEndpoint"]>>>();
    vi.mocked(api.probeEndpoint).mockReturnValueOnce(result.promise);
    const running = controller.detect();
    await controller.remove();
    result.resolve({ source: "ollama", models: [{ id: "late-model" }] });
    await running;
    expect(controller.read().draft).toBeNull();
    expect(controller.read().authorizedBaseUrl).toBeNull();
    expect(api.updateEndpointModels).not.toHaveBeenCalled();
    expect(api.setEndpoint).not.toHaveBeenCalled();
  });

  it("does not clear a later discovery's busy state when an invalidated probe finishes", async () => {
    const { api, controller } = fixture();
    await controller.refresh();
    const oldResult =
      deferred<Awaited<ReturnType<SettingsOllama.API["probeEndpoint"]>>>();
    const newResult =
      deferred<Awaited<ReturnType<SettingsOllama.API["probeEndpoint"]>>>();
    vi.mocked(api.probeEndpoint)
      .mockReturnValueOnce(oldResult.promise)
      .mockReturnValueOnce(newResult.promise);
    const oldProbe = controller.detect();
    controller.edit(controller.read().draft!);
    const newProbe = controller.detect();
    oldResult.resolve({ source: "ollama", models: [] });
    await oldProbe;
    expect(controller.read().probing).toBe(true);
    newResult.resolve({ source: "ollama", models: [] });
    await newProbe;
    expect(controller.read().probing).toBe(false);
  });

  it("retains an editable draft when Save fails", async () => {
    const { api, controller } = fixture({ saved: false });
    await controller.refresh();
    controller.setup();
    vi.mocked(api.setEndpoint).mockRejectedValueOnce(new Error("unavailable"));
    await controller.save();
    expect(controller.read()).toMatchObject({
      kind: "ready",
      dirty: true,
      error: "unavailable",
    });
    expect(controller.read().draft).not.toBeNull();
    expect(api.probeEndpoint).not.toHaveBeenCalled();
  });

  it("does not probe when consent inspection fails", async () => {
    const { api, controller } = fixture();
    vi.mocked(api.endpointAuthorization).mockRejectedValueOnce(
      new Error("unavailable")
    );
    await controller.refresh();
    expect(controller.read().error).toBe("unavailable");
    expect(api.probeEndpoint).not.toHaveBeenCalled();
    expect(api.setEndpoint).not.toHaveBeenCalled();
  });

  it("retains existing config and explains when the running Main process needs a restart", async () => {
    const { api, controller } = fixture();
    vi.mocked(api.endpointAuthorization).mockRejectedValueOnce(
      new Error(
        "No handler registered for 'grida:provider:endpoint:authorization'"
      )
    );
    await controller.refresh();
    expect(controller.read()).toMatchObject({
      kind: "unavailable",
      persisted: true,
      draft: endpoint,
      error: "Please relaunch Grida Desktop to use this connection.",
    });
    await controller.save();
    expect(api.setEndpoint).not.toHaveBeenCalled();
  });

  it("offers Connect if the host reports that background consent changed", async () => {
    const { api, controller } = fixture();
    await controller.refresh();
    vi.mocked(api.probeEndpoint).mockRejectedValueOnce(
      new Error(
        "Error invoking remote method: provider_endpoint_connect_required"
      )
    );
    await controller.detect();
    expect(SettingsOllama.needsConnection(controller.read())).toBe(true);
    expect(controller.read().probeNote).toContain("Connect to this address");
    expect(api.setEndpoint).not.toHaveBeenCalled();
  });

  it("compares canonical full addresses and does not treat a different path as approved", () => {
    expect(
      SettingsOllama.sameAddress("HTTP://LOCALHOST:11434/v1", endpoint.base_url)
    ).toBe(true);
    expect(
      SettingsOllama.sameAddress(
        endpoint.base_url,
        "http://localhost:11434/other"
      )
    ).toBe(false);
    expect(SettingsOllama.sameAddress(endpoint.base_url, "invalid")).toBe(
      false
    );
  });
});
