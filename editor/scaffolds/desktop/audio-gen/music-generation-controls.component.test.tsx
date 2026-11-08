// DOM-only music lifecycle check; no provider calls or canvas rendering.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { CurrentGGModel } from "@/lib/desktop/gg-models";
import type {
  VideoGenerateRequest,
  VideoGenerateResult,
} from "@/lib/desktop/bridge";
import { MediaModelAvailability } from "../shared/media-model-availability";
import type { GridaGatewaySessionState } from "@/lib/desktop/gg-session";

const dom = await vi.hoisted(async () => {
  // jsdom's optional canvas adapter is not used by this form test. Do not load
  // a platform-specific native graphics binary just to create a DOM test window.
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const environmentRequire = createRequire(
    require.resolve("vitest/package.json")
  );
  const jsdomPath = environmentRequire.resolve("jsdom");
  const domRequire = createRequire(jsdomPath);
  let canvasPath: string | undefined;
  let canvasEntry: NodeJS.Module | undefined;
  try {
    canvasPath = domRequire.resolve("canvas");
    canvasEntry = require.cache[canvasPath];
    require.cache[canvasPath] = {
      exports: { createCanvas: undefined },
      loaded: true,
    } as unknown as NodeJS.Module;
  } catch {
    /* optional peer is absent in some installations */
  }
  const { JSDOM } = domRequire(jsdomPath);
  if (canvasPath) {
    if (canvasEntry) require.cache[canvasPath] = canvasEntry;
    else delete require.cache[canvasPath];
  }
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost",
  });
  for (const key of [
    "window",
    "document",
    "DocumentFragment",
    "HTMLSelectElement",
    "HTMLOptionElement",
    "HTMLElement",
    "HTMLTextAreaElement",
    "HTMLButtonElement",
    "HTMLFormElement",
    "Element",
    "Node",
    "Event",
    "CustomEvent",
    "MutationObserver",
    "FormData",
    "File",
    "FileList",
    "navigator",
  ]) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value: dom.window[key],
    });
  }
  return dom;
});
afterAll(() => dom.window.close());

const discovery = vi.hoisted(() => ({
  models: [] as readonly CurrentGGModel[] | null,
}));
const generate = vi.hoisted(() => vi.fn<() => Promise<void>>());
vi.mock("@/lib/desktop/gg-models", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/desktop/gg-models")>()),
  useGGModels: () => discovery.models,
}));
const videoState = vi.hoisted(() => ({
  state: {
    loaded: true,
    configured: [],
    hosted: true,
  } as MediaModelAvailability.VideoProviderState,
  refresh:
    vi.fn<
      (model: string) => Promise<MediaModelAvailability.VideoProviderState>
    >(),
  generate:
    vi.fn<(request: VideoGenerateRequest) => Promise<VideoGenerateResult>>(),
}));
vi.mock("@/lib/desktop/video-providers", () => ({
  useVideoProviders: () => ({
    state: videoState.state,
    refresh: videoState.refresh,
  }),
}));
const nativeBridge = vi.hoisted(() => ({
  secrets: { has: vi.fn<(id: string) => Promise<boolean>>() },
}));
const hostedSession = vi.hoisted(() => ({
  ensureFresh: vi.fn<() => Promise<GridaGatewaySessionState>>(),
}));
vi.mock("@/lib/desktop/bridge", () => ({
  useDesktopBridge: () => nativeBridge,
  audio: { music: { isSupported: () => true, generate } },
  video: { generate: videoState.generate },
}));
vi.mock("@/lib/desktop/gg-session", () => ({
  ensureFresh: hostedSession.ensureFresh,
  forceRefresh: vi.fn<() => Promise<void>>(),
}));
import { MusicGenerationControls } from "./music-generation-controls";
import { DesktopVideoPlayground } from "../video-gen/video-playground";
const { useVideoProviders: useRealVideoProviders } = await vi.importActual<
  typeof import("@/lib/desktop/video-providers")
>("@/lib/desktop/video-providers");

const model: CurrentGGModel = {
  id: "fixture/new-music",
  label: "Fixture music",
  kind: "music",
  created: 0,
  owned_by: "fixture",
  interfaces: ["endpoints"],
  input_modalities: ["text"],
  output_modalities: ["audio"],
  operation_ids: [],
  capabilities: {},
  limits: {},
};
let container: HTMLDivElement;
let root: Root;
const props = { initialModelId: model.id, onGenerated: vi.fn<() => void>() };
async function render() {
  await act(async () => {
    root.render(<MusicGenerationControls {...props} />);
  });
}
beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  discovery.models = [model];
  generate.mockClear();
  videoState.state = { loaded: true, configured: [], hosted: true };
  videoState.refresh.mockReset();
  videoState.generate.mockReset();
  videoState.refresh.mockResolvedValue(videoState.state);
  nativeBridge.secrets.has.mockReset();
  nativeBridge.secrets.has.mockImplementation(async (id) => id === "vercel");
  hostedSession.ensureFresh.mockReset();
  hostedSession.ensureFresh.mockResolvedValue({
    kind: "active",
    expires_at: Date.now() + 900_000,
    organization: { id: 1, name: "Fixture" },
  });
  videoState.generate.mockResolvedValue({
    model_id: "fixture/video",
    provider_id: "gg",
    videos: [{ base64: "AA==", media_type: "video/mp4" }],
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("music draft and explicit model preservation", () => {
  it("keeps the same draft composer through an outage and recovery", async () => {
    await render();
    const textarea = container.querySelector("textarea")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      )!.set!;
      setter.call(textarea, "Keep this music draft");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    discovery.models = [];
    await render();
    expect(container.querySelector("textarea")).toBe(textarea);
    expect(textarea.value).toBe("Keep this music draft");
    expect(container.textContent).toContain("Your draft is kept");
    expect(
      container.querySelector<HTMLButtonElement>(
        'button[aria-label="Generate music"]'
      )!.disabled
    ).toBe(true);
    discovery.models = [model];
    await render();
    expect(container.querySelector("textarea")).toBe(textarea);
    expect(textarea.value).toBe("Keep this music draft");
    expect(
      container.querySelector<HTMLButtonElement>(
        'button[aria-label="Generate music"]'
      )!.disabled
    ).toBe(false);
    expect(generate).not.toHaveBeenCalled();
  });
  it("does not substitute a different model or clear an unavailable submission", async () => {
    discovery.models = [
      { ...model, id: "fixture/other-music", label: "Other music" },
    ];
    await render();
    expect(container.textContent).toContain("Select another model");
    const textarea = container.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      )!.set!.call(textarea, "Still my draft");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      container
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true })
        );
    });
    expect(textarea.value).toBe("Still my draft");
    expect(generate).not.toHaveBeenCalled();
    expect(
      container.querySelector<HTMLButtonElement>(
        'button[aria-label="Generate music"]'
      )!.disabled
    ).toBe(true);
  });
});

const videoModel: CurrentGGModel = {
  ...model,
  id: "fixture/video",
  label: "Fixture video",
  kind: "video",
  interfaces: ["videos"],
  client_supported_options: { video_text: true },
};
async function renderVideo() {
  await act(async () => {
    root.render(<DesktopVideoPlayground initialModelId={videoModel.id} />);
  });
}
async function typeDraft(text: string) {
  const textarea = container.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )!.set!.call(textarea, text);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return textarea;
}
function submitVideo() {
  container
    .querySelector("form")!
    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}
describe("video preflight admission and draft preservation", () => {
  it("admits only one generation when two submissions arrive during deferred preflight", async () => {
    discovery.models = [videoModel];
    let finishPreflight: (
      state: MediaModelAvailability.VideoProviderState
    ) => void = () => {};
    const preflight = new Promise<MediaModelAvailability.VideoProviderState>(
      (resolve) => {
        finishPreflight = resolve;
      }
    );
    videoState.refresh.mockReturnValueOnce(preflight);
    await renderVideo();
    const textarea = await typeDraft("One intended video");
    await act(async () => {
      submitVideo();
      submitVideo();
    });
    expect(videoState.refresh).toHaveBeenCalledTimes(1);
    expect(videoState.generate).not.toHaveBeenCalled();
    expect(textarea.value).toBe("One intended video");
    expect(textarea.disabled).toBe(true);
    expect(
      container.querySelector<HTMLButtonElement>('button[type="submit"]')!
        .disabled
    ).toBe(true);
    await act(async () => {
      finishPreflight(videoState.state);
    });
    expect(videoState.generate).toHaveBeenCalledExactlyOnceWith({
      model_id: videoModel.id,
      prompt: "One intended video",
    });
    expect(textarea.disabled).toBe(false);
  });
  it("shows changed readiness, keeps the draft and never dispatches after failed preflight", async () => {
    discovery.models = [videoModel];
    videoState.refresh.mockImplementationOnce(async () => {
      videoState.state = { loaded: true, configured: [], hosted: false };
      return videoState.state;
    });
    await renderVideo();
    const textarea = await typeDraft("Keep this unpaid video draft");
    await act(async () => {
      submitVideo();
    });
    expect(videoState.refresh).toHaveBeenCalledTimes(1);
    expect(videoState.generate).not.toHaveBeenCalled();
    expect(textarea.value).toBe("Keep this unpaid video draft");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "unavailable"
    );
    expect(
      container.querySelector<HTMLButtonElement>('button[type="submit"]')!
        .disabled
    ).toBe(true);
    expect(textarea.disabled).toBe(false);
  });
});

describe("video native and hosted readiness remain independent", () => {
  let latest: ReturnType<typeof useRealVideoProviders>;
  function ReadinessProbe() {
    latest = useRealVideoProviders();
    return <span>{latest.state.hosted ? "GG ready" : "GG unavailable"}</span>;
  }
  it("returns connected BYOK immediately without disabling GG while the session read is deferred", async () => {
    await act(async () => {
      root.render(<ReadinessProbe />);
    });
    expect(latest!.state.hosted).toBe(true);
    let finishSession: (state: GridaGatewaySessionState) => void = () => {};
    const pendingSession = new Promise<GridaGatewaySessionState>((resolve) => {
      finishSession = resolve;
    });
    hostedSession.ensureFresh.mockReturnValueOnce(pendingSession);
    await act(async () => {
      const refreshed = await latest!.refresh("google/veo-3.1");
      expect(refreshed.configured).toEqual(["vercel"]);
      expect(refreshed.hosted).toBe(true);
    });
    expect(container.textContent).toBe("GG ready");
    expect(
      MediaModelAvailability.video(videoModel.id, [videoModel], latest!.state)
        .available
    ).toBe(true);
    await act(async () => {
      finishSession({ kind: "signed_out" });
    });
    expect(container.textContent).toBe("GG unavailable");
    expect(
      MediaModelAvailability.video("google/veo-3.1", [], latest!.state)
        .available
    ).toBe(true);
  });
  it("ignores a late session result after a newer focus refresh", async () => {
    await act(async () => {
      root.render(<ReadinessProbe />);
    });
    let finishOldSession: (state: GridaGatewaySessionState) => void = () => {};
    hostedSession.ensureFresh.mockReturnValueOnce(
      new Promise<GridaGatewaySessionState>((resolve) => {
        finishOldSession = resolve;
      })
    );
    await act(async () => {
      await latest!.refresh("google/veo-3.1");
    });
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(container.textContent).toBe("GG ready");
    await act(async () => {
      finishOldSession({ kind: "signed_out" });
    });
    expect(container.textContent).toBe("GG ready");
  });
});
