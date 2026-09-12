import {
  AnimationClip,
  AnimationMixer,
  Bone,
  BufferGeometry,
  Group,
  MeshBasicMaterial,
  NumberKeyframeTrack,
  Points,
  Scene,
  Skeleton,
  SkinnedMesh,
  Vector3,
} from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { describe, expect, it, vi } from "vitest";
import { RiggingSkeletonOverlay } from "./rigging-skeleton-overlay";

function asset() {
  const root = new Group();
  const hip = new Bone();
  const spine = new Bone();
  const head = new Bone();
  hip.name = "hip";
  spine.name = "spine";
  head.name = "head";
  hip.position.x = 1;
  spine.position.y = 3;
  head.position.y = 4;
  const spacer = new Group();
  spacer.position.y = 2;
  hip.add(spacer);
  spacer.add(spine);
  spine.add(head);
  root.add(hip);
  // A loose bone is not part of either mesh's skeleton and must stay hidden.
  root.add(new Bone());
  const skeleton = new Skeleton([hip, spine, head]);
  const mesh = new SkinnedMesh(new BufferGeometry(), new MeshBasicMaterial());
  mesh.bind(skeleton);
  const secondMesh = new SkinnedMesh(mesh.geometry, mesh.material);
  secondMesh.bind(skeleton);
  root.add(mesh, secondMesh);
  return { root, hip, spine, head, mesh, skeleton };
}
function drawing(overlay: RiggingSkeletonOverlay) {
  const bones = overlay.children.find(
    (object) =>
      object instanceof LineSegments2 && object.material.linewidth === 2
  ) as LineSegments2;
  const points = overlay.children.find(
    (object) => object instanceof Points
  ) as Points<BufferGeometry>;
  return { bones, points };
}

describe("RiggingSkeletonOverlay", () => {
  it("deduplicates shared skin joints and follows the hierarchy through transform nodes", () => {
    const { root } = asset();
    const scene = new Scene();
    root.position.x = 10;
    root.rotation.z = Math.PI / 2;
    const overlay = new RiggingSkeletonOverlay(root);
    overlay.position.x = 4;
    scene.add(root, overlay);
    scene.updateMatrixWorld(true);
    overlay.update();
    const { bones, points } = drawing(overlay);
    expect(points.geometry.getAttribute("position").count).toBe(3);
    expect(bones.geometry.instanceCount).toBe(2);
    const positions = points.geometry.getAttribute("position");
    expect(new Vector3().fromBufferAttribute(positions, 0).toArray()).toEqual([
      6, 1, 0,
    ]);
    expect(new Vector3().fromBufferAttribute(positions, 1).toArray()).toEqual([
      1, 1, 0,
    ]);
    expect(new Vector3().fromBufferAttribute(positions, 2).toArray()).toEqual([
      -3, 1, 0,
    ]);
    const start = bones.geometry.getAttribute("instanceStart");
    const end = bones.geometry.getAttribute("instanceEnd");
    expect(new Vector3().fromBufferAttribute(start, 0).toArray()).toEqual([
      6, 1, 0,
    ]);
    expect(new Vector3().fromBufferAttribute(end, 0).toArray()).toEqual([
      1, 1, 0,
    ]);
    expect(new Vector3().fromBufferAttribute(end, 1).toArray()).toEqual([
      -3, 1, 0,
    ]);
    overlay.dispose();
  });

  it("tracks AnimationMixer poses in existing GPU buffers without changing the mesh", () => {
    const { root, mesh, spine } = asset();
    const overlay = new RiggingSkeletonOverlay(root);
    const scene = new Scene();
    scene.add(root, overlay);
    const mixer = new AnimationMixer(root);
    mixer
      .clipAction(
        new AnimationClip("pose", 2, [
          new NumberKeyframeTrack("spine.position[y]", [0, 2], [3, 7]),
        ])
      )
      .play();
    const { bones, points } = drawing(overlay);
    const positions = points.geometry.getAttribute("position");
    const originalBuffer = positions.array;
    const originalGeometry = mesh.geometry;
    const originalMaterial = mesh.material;
    for (const expected of [4, 5]) {
      mixer.update(0.5);
      scene.updateMatrixWorld(true);
      overlay.update();
      expect(spine.position.y).toBe(expected);
      expect(positions.getY(1)).toBe(expected + 2);
      expect(bones.geometry.getAttribute("instanceEnd").getY(0)).toBe(
        expected + 2
      );
      expect(positions.array).toBe(originalBuffer);
    }
    expect(mesh.geometry).toBe(originalGeometry);
    expect(mesh.material).toBe(originalMaterial);
    expect(mesh.position.toArray()).toEqual([0, 0, 0]);
    overlay.dispose();
  });

  it("keeps pixel sizes and contrast independent of depth, tone mapping and viewport size", () => {
    const { root } = asset();
    const overlay = new RiggingSkeletonOverlay(root);
    overlay.setSize(800, 450);
    const { bones, points } = drawing(overlay);
    expect(bones.material.resolution.toArray()).toEqual([800, 450]);
    expect(bones.material.worldUnits).toBe(false);
    expect(bones.material.linewidth).toBe(2);
    expect(bones.material.color.getHex()).toBe(0x4deaff);
    expect(points.material).toMatchObject({ size: 7, sizeAttenuation: false });
    for (const object of overlay.children) {
      const material = (object as LineSegments2).material;
      expect(material).toMatchObject({
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        transparent: true,
      });
      expect(object.frustumCulled).toBe(false);
    }
    overlay.setSize(0, Number.NaN);
    expect(bones.material.resolution.toArray()).toEqual([1, 1]);
    overlay.dispose();
  });

  it("handles empty and unbound assets and disposes owned resources exactly once", () => {
    const empty = new Group();
    empty.add(new SkinnedMesh());
    const inert = new RiggingSkeletonOverlay(empty);
    inert.update();
    expect(inert.children.every((object) => !object.visible)).toBe(true);
    inert.dispose();

    const { root, mesh } = asset();
    const overlay = new RiggingSkeletonOverlay(root);
    const scene = new Scene();
    scene.add(root, overlay);
    const sourceDisposed = vi.fn<() => void>();
    mesh.geometry.addEventListener("dispose", sourceDisposed);
    (mesh.material as MeshBasicMaterial).addEventListener(
      "dispose",
      sourceDisposed
    );
    const resources = new Set(
      overlay.children.flatMap((object) => {
        const drawable = object as LineSegments2;
        return [drawable.geometry, drawable.material];
      })
    );
    const disposals = [...resources].map((resource) => {
      const listener = vi.fn<() => void>();
      resource.addEventListener("dispose", listener);
      return listener;
    });
    const texture = (
      drawing(overlay).points.material as import("three").PointsMaterial
    ).map!;
    const textureDisposed = vi.fn<() => void>();
    texture.addEventListener("dispose", textureDisposed);
    overlay.dispose();
    overlay.dispose();
    overlay.update();
    overlay.setSize(10, 10);
    expect(overlay.parent).toBeNull();
    expect(overlay.children).toHaveLength(0);
    for (const listener of disposals) expect(listener).toHaveBeenCalledOnce();
    expect(textureDisposed).toHaveBeenCalledOnce();
    expect(sourceDisposed).not.toHaveBeenCalled();
    expect(root.parent).toBe(scene);
  });
});
