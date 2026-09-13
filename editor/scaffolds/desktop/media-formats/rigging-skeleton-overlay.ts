import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  DynamicDrawUsage,
  Group,
  InterleavedBufferAttribute,
  LinearFilter,
  Matrix4,
  Object3D,
  Points,
  PointsMaterial,
  SkinnedMesh,
  SRGBColorSpace,
  Vector3,
} from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";

/** A screen-sized overlay of the joints actually used to skin an asset. */
export class RiggingSkeletonOverlay extends Group {
  private readonly joints: Object3D[];
  private readonly links: [number, number][] = [];
  private readonly jointPositions: Float32Array;
  private readonly bonePositions: Float32Array;
  private readonly jointGeometry = new BufferGeometry();
  private readonly boneGeometry = new LineSegmentsGeometry();
  private readonly jointTexture = jointMarker();
  private readonly jointMaterial = new PointsMaterial({
    color: 0xffffff,
    map: this.jointTexture,
    size: 7,
    sizeAttenuation: false,
    alphaTest: 0.01,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly boneMaterial = new LineMaterial({
    color: 0x4deaff,
    linewidth: 2,
    worldUnits: false,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly outlineMaterial = new LineMaterial({
    color: 0x081722,
    linewidth: 4,
    worldUnits: false,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly inverseWorld = new Matrix4();
  private readonly positionScratch = new Vector3();
  private disposed = false;

  constructor(root: Object3D) {
    super();
    this.name = "Rigging skeleton overlay";
    this.renderOrder = 1_000;
    const joints = new Set<Object3D>();
    root.traverse((object) => {
      if (object instanceof SkinnedMesh && object.skeleton)
        for (const bone of object.skeleton.bones) joints.add(bone);
    });
    this.joints = [...joints];
    const indices = new Map(this.joints.map((joint, index) => [joint, index]));
    for (const [index, joint] of this.joints.entries()) {
      // glTF can insert transform nodes between participating skeleton joints.
      let parent = joint.parent;
      while (parent && !indices.has(parent)) parent = parent.parent;
      if (parent) this.links.push([indices.get(parent)!, index]);
    }

    this.jointPositions = new Float32Array(this.joints.length * 3);
    this.bonePositions = new Float32Array(this.links.length * 6);
    this.jointGeometry.setAttribute(
      "position",
      new BufferAttribute(this.jointPositions, 3).setUsage(DynamicDrawUsage)
    );
    this.boneGeometry.setPositions(this.bonePositions);
    const starts = this.boneGeometry.getAttribute("instanceStart");
    if (starts instanceof InterleavedBufferAttribute)
      starts.data.setUsage(DynamicDrawUsage);

    const outline = new LineSegments2(this.boneGeometry, this.outlineMaterial);
    const bones = new LineSegments2(this.boneGeometry, this.boneMaterial);
    const markers = new Points(this.jointGeometry, this.jointMaterial);
    outline.visible = bones.visible = this.links.length > 0;
    markers.visible = this.joints.length > 0;
    for (const [index, object] of [outline, bones, markers].entries()) {
      // Transparent render ordering keeps the overlay above transparent meshes
      // too. Animated joints can leave the initial bounds, so never cull them.
      object.renderOrder = this.renderOrder + index;
      object.frustumCulled = false;
      this.add(object);
    }
  }

  /** Call after scene.updateMatrixWorld(true), including after animation updates. */
  update(): void {
    if (this.disposed || this.joints.length === 0) return;
    this.inverseWorld.copy(this.matrixWorld).invert();
    for (let index = 0; index < this.joints.length; index++) {
      this.positionScratch
        .setFromMatrixPosition(this.joints[index].matrixWorld)
        .applyMatrix4(this.inverseWorld)
        .toArray(this.jointPositions, index * 3);
    }
    for (let index = 0; index < this.links.length; index++) {
      const [parent, joint] = this.links[index];
      for (let axis = 0; axis < 3; axis++) {
        this.bonePositions[index * 6 + axis] =
          this.jointPositions[parent * 3 + axis];
        this.bonePositions[index * 6 + 3 + axis] =
          this.jointPositions[joint * 3 + axis];
      }
    }
    this.jointGeometry.getAttribute("position").needsUpdate = true;
    this.boneGeometry.getAttribute("instanceStart").needsUpdate = true;
  }

  /** CSS viewport dimensions; the line addon also refreshes these when rendered. */
  setSize(width: number, height: number): void {
    if (this.disposed) return;
    const w = Number.isFinite(width) ? Math.max(1, width) : 1;
    const h = Number.isFinite(height) ? Math.max(1, height) : 1;
    this.boneMaterial.resolution.set(w, h);
    this.outlineMaterial.resolution.set(w, h);
  }

  /** Owns only overlay resources; never disposes or changes the asset's meshes. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.removeFromParent();
    this.clear();
    this.boneGeometry.dispose();
    this.jointGeometry.dispose();
    this.boneMaterial.dispose();
    this.outlineMaterial.dispose();
    this.jointMaterial.dispose();
    this.jointTexture.dispose();
    this.joints.length = 0;
    this.links.length = 0;
  }
}

/** A local circular marker with a bright center and dark rim; no DOM or image I/O. */
function jointMarker(): DataTexture {
  const size = 32;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const radius =
        Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
      const offset = (y * size + x) * 4;
      const color =
        radius < 0.42
          ? [224, 253, 255]
          : radius < 0.74
            ? [77, 234, 255]
            : [8, 23, 34];
      pixels.set(color, offset);
      pixels[offset + 3] = Math.round(
        Math.min(1, Math.max(0, (1 - radius) * 16)) * 255
      );
    }
  }
  const texture = new DataTexture(pixels, size, size);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
