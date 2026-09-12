import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimationClip, Bone, Group, NumberKeyframeTrack } from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { LocalGltfPreviewController } from "./local-gltf-preview-controller";
import { LocalGltfBundle } from "./local-gltf-bundle";
import { RiggingMotion } from "./rigging-motion";

const io = vi.hoisted(() => ({
  parse: vi.fn<(bytes: ArrayBuffer) => Promise<GLTF>>(),
  fetch: vi.fn<typeof fetch>(),
}));

// Keep Three's scene graph and AnimationMixer real. Only browser rendering
// and input decoding are replaced: these tests exercise controller ordering.
vi.mock("three", async (importOriginal) => {
  const three = await importOriginal<typeof import("three")>();
  return {
    ...three,
    WebGLRenderer: class {
      domElement = { style: {}, setAttribute() {}, remove() {} };
      renderLists = { dispose() {} };
      setPixelRatio() {}
      setSize() {}
      setAnimationLoop() {}
      render() {}
      dispose() {}
      forceContextLoss() {}
    },
  };
});
vi.mock("three/examples/jsm/controls/OrbitControls.js", async () => {
  const { Vector3 } = await import("three");
  return {
    OrbitControls: class {
      target = new Vector3();
      update() {}
      dispose() {}
    },
  };
});
vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class {
    register() {}
    parseAsync = io.parse;
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function asset(name: string, duration = 0) {
  const scene = new Group();
  const bone = new Bone();
  bone.position.y = 7;
  scene.add(bone);
  const gltf = {
    scene,
    scenes: [scene],
    animations: duration ? [new AnimationClip(name, duration, [])] : [],
  } as unknown as GLTF;
  return { gltf, bone };
}

describe("LocalGltfPreviewController motion lifecycle", () => {
  const controllers: LocalGltfPreviewController[] = [];
  let assets: Map<ArrayBuffer, GLTF | Promise<GLTF>>;
  let sourceBytes: Record<RiggingMotion.PresetId, ArrayBuffer>;

  beforeEach(() => {
    assets = new Map();
    sourceBytes = { dance: new ArrayBuffer(1), samba: new ArrayBuffer(2) };
    assets.set(sourceBytes.dance, asset("dance", 2).gltf);
    assets.set(sourceBytes.samba, asset("samba", 4).gltf);
    io.parse.mockImplementation(async (bytes) => {
      const result = assets.get(bytes);
      if (!result) throw new Error("Unexpected asset");
      return result;
    });
    io.fetch.mockImplementation(async (url) => {
      const preset = RiggingMotion.presets.find(({ src }) => src === url);
      if (!preset) throw new Error("Unexpected network request");
      return {
        ok: true,
        arrayBuffer: async () => sourceBytes[preset.id],
      } as Response;
    });
    vi.stubGlobal("fetch", io.fetch);
    vi.spyOn(RiggingMotion, "supports").mockReturnValue(true);
    vi.spyOn(RiggingMotion, "retarget").mockImplementation(
      (_source, clip, target) =>
        new AnimationClip(clip.name, clip.duration, [
          new NumberKeyframeTrack(
            `${target.children[0].uuid}.position[y]`,
            [0, clip.duration],
            [clip.duration * 10, clip.duration * 20]
          ),
        ])
    );
  });

  afterEach(() => {
    for (const controller of controllers.splice(0)) controller.dispose();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    io.parse.mockReset();
    io.fetch.mockReset();
  });

  function controller() {
    const statuses: LocalGltfPreviewController.MotionStatus[] = [];
    const container = {
      clientWidth: 800,
      clientHeight: 600,
      appendChild() {},
    } as unknown as HTMLElement;
    const instance = new LocalGltfPreviewController(container, {
      active: false,
      previewMotion: "rest",
      onMotionStatusChange: (status) => statuses.push(status),
    });
    controllers.push(instance);
    return { instance, statuses };
  }

  async function load(instance: LocalGltfPreviewController, name: string) {
    const target = asset(name);
    const bytes = new ArrayBuffer(3);
    assets.set(bytes, target.gltf);
    vi.spyOn(LocalGltfBundle, "open").mockReturnValue({
      entry: { file: { name }, format: "glb", stability: "stable" },
      read: async () => bytes,
    } as unknown as LocalGltfBundle);
    await instance.load([]);
    return target;
  }

  it("caches Dance and Samba separately and Rest restores the original pose", async () => {
    const { instance, statuses } = controller();
    const target = await load(instance, "first.glb");
    for (const [motion, duration] of [
      ["dance", 2],
      ["samba", 4],
      ["dance", 2],
    ] as const) {
      instance.setPreviewMotion(motion);
      await vi.waitFor(() =>
        expect(statuses.at(-1)).toEqual({ phase: "ready", duration })
      );
      expect(target.bone.position.y).toBe(duration * 10);
    }
    expect(io.fetch.mock.calls.map(([url]) => url)).toEqual([
      "/assets/motions/dance.glb",
      "/assets/motions/samba.glb",
    ]);
    expect(RiggingMotion.retarget).toHaveBeenCalledTimes(2);
    instance.setPreviewMotion("rest");
    expect(statuses.at(-1)).toEqual({ phase: "idle" });
    expect(target.bone.position.y).toBe(7);
  });

  it("ignores a canceled decode finishing after another motion is selected", async () => {
    const { instance, statuses } = controller();
    const target = await load(instance, "first.glb");
    const late = deferred<GLTF>();
    assets.set(sourceBytes.dance, late.promise);
    instance.setPreviewMotion("dance");
    await vi.waitFor(() =>
      expect(io.parse).toHaveBeenCalledWith(sourceBytes.dance, "")
    );
    const signal = io.fetch.mock.calls[0][1]?.signal;
    instance.setPreviewMotion("samba");
    await vi.waitFor(() =>
      expect(statuses.at(-1)).toEqual({ phase: "ready", duration: 4 })
    );
    expect(signal?.aborted).toBe(true);
    const previous = [...statuses];
    late.resolve(asset("dance", 2).gltf);
    await late.promise;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(statuses).toEqual(previous);
    expect(target.bone.position.y).toBe(40);
    expect(RiggingMotion.retarget).toHaveBeenCalledTimes(1);
  });

  it("retargets cached presets again after the target asset is replaced", async () => {
    const { instance, statuses } = controller();
    const first = await load(instance, "first.glb");
    instance.setPreviewMotion("dance");
    await vi.waitFor(() => expect(first.bone.position.y).toBe(20));
    const second = await load(instance, "second.glb");
    await vi.waitFor(() => expect(second.bone.position.y).toBe(20));
    expect(statuses.at(-1)).toEqual({ phase: "ready", duration: 2 });
    expect(io.fetch).toHaveBeenCalledTimes(2);
    expect(RiggingMotion.retarget).toHaveBeenNthCalledWith(
      2,
      expect.any(Group),
      expect.any(AnimationClip),
      second.gltf.scene
    );
    expect(first.bone.position.y).toBe(7);
    instance.setPreviewMotion("rest");
    expect(second.bone.position.y).toBe(7);
  });

  it("isolates a failed Samba load and permits an explicit retry", async () => {
    const { instance, statuses } = controller();
    const target = await load(instance, "first.glb");
    instance.setPreviewMotion("dance");
    await vi.waitFor(() => expect(target.bone.position.y).toBe(20));

    io.fetch.mockRejectedValueOnce(new Error("Unavailable"));
    instance.setPreviewMotion("samba");
    await vi.waitFor(() =>
      expect(statuses.at(-1)).toEqual({
        phase: "error",
        message:
          "Could not load the Samba preview. Select Rest pose and try again.",
      })
    );
    expect(target.bone.position.y).toBe(7);
    instance.setPreviewMotion("dance");
    expect(statuses.at(-1)).toEqual({ phase: "ready", duration: 2 });
    expect(target.bone.position.y).toBe(20);
    expect(io.fetch).toHaveBeenCalledTimes(2);

    instance.setPreviewMotion("samba");
    await vi.waitFor(() =>
      expect(statuses.at(-1)).toEqual({ phase: "ready", duration: 4 })
    );
    expect(target.bone.position.y).toBe(40);
    expect(io.fetch).toHaveBeenCalledTimes(3);
    expect(RiggingMotion.retarget).toHaveBeenCalledTimes(2);
  });

  it("does not revive a pending motion after Rest is selected", async () => {
    const { instance, statuses } = controller();
    const target = await load(instance, "first.glb");
    const late = deferred<GLTF>();
    assets.set(sourceBytes.samba, late.promise);
    instance.setPreviewMotion("samba");
    await vi.waitFor(() =>
      expect(io.parse).toHaveBeenCalledWith(sourceBytes.samba, "")
    );
    instance.setPreviewMotion("rest");
    const previous = [...statuses];
    late.resolve(asset("samba", 4).gltf);
    await late.promise;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(statuses).toEqual(previous);
    expect(statuses.at(-1)).toEqual({ phase: "idle" });
    expect(target.bone.position.y).toBe(7);
    expect(RiggingMotion.retarget).not.toHaveBeenCalled();
  });
});
