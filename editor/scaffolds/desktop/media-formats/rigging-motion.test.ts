import { describe, expect, it } from "vitest";
import {
  AnimationClip,
  AnimationMixer,
  Bone,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  MeshBasicMaterial,
  Quaternion,
  QuaternionKeyframeTrack,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3,
  VectorKeyframeTrack,
} from "three";
import { RiggingMotion } from "./rigging-motion";

describe("RiggingMotion.supports", () => {
  it("recognizes complete Mixamo and Blender humanoids", () => {
    expect(RiggingMotion.supports(humanoid().root)).toBe(true);
    const blender = humanoid();
    const names: Record<string, string> = {
      Hips: "hips",
      Spine: "spine.001",
      Head: "head",
      LeftArm: "upper_arm.L",
      LeftForeArm: "forearm.L",
      LeftHand: "hand.L",
      RightArm: "upper_arm.R",
      RightForeArm: "forearm.R",
      RightHand: "hand.R",
      LeftUpLeg: "thigh.L",
      LeftLeg: "shin.L",
      LeftFoot: "foot.L",
      RightUpLeg: "thigh.R",
      RightLeg: "shin.R",
      RightFoot: "foot.R",
    };
    for (const [name, bone] of Object.entries(blender.bones)) {
      bone.name = `DEF-${names[name]}`;
    }
    expect(RiggingMotion.supports(blender.root)).toBe(true);
  });

  it("rejects creatures, missing limbs, and names in the wrong hierarchy", () => {
    const creature = humanoid();
    creature.bones.LeftArm.name = "tripo::0_Left_Limb_0";
    expect(RiggingMotion.supports(creature.root)).toBe(false);
    const missing = humanoid();
    missing.bones.LeftHand.removeFromParent();
    expect(RiggingMotion.supports(missing.root)).toBe(false);
    const wrongHierarchy = humanoid();
    wrongHierarchy.bones.RightArm.add(wrongHierarchy.bones.LeftForeArm);
    expect(RiggingMotion.supports(wrongHierarchy.root)).toBe(false);
  });

  it("rejects ambiguous humanoid bone names", () => {
    const target = humanoid();
    const duplicate = new Bone();
    duplicate.name = "mixamorig:Hips";
    target.root.add(duplicate);
    expect(RiggingMotion.supports(target.root)).toBe(false);
  });
});

describe("RiggingMotion.retarget", () => {
  it("compensates A/T poses and bind axes without mutating either scene", () => {
    const source = humanoid();
    const target = humanoid({ aPose: true, twist: 0.7, scale: 2 });
    const originalSource = snapshot(source);
    const originalTarget = snapshot(target);
    const clip = RiggingMotion.retarget(
      source.root,
      armClip(source),
      target.root
    )!;
    expect(snapshot(source)).toEqual(originalSource);
    expect(snapshot(target)).toEqual(originalTarget);
    expect(
      clip.tracks.every((track) => track.values.every(Number.isFinite))
    ).toBe(true);
    pose(target, clip, 0);
    const direction = target.bones.LeftForeArm.getWorldPosition(new Vector3())
      .sub(target.bones.LeftArm.getWorldPosition(new Vector3()))
      .normalize();
    expect(direction.x).toBeCloseTo(1, 5);
    expect(direction.y).toBeCloseTo(0, 5);
    expect(direction.z).toBeCloseTo(0, 5);
  });

  it("keeps horizontal hip travel in place and scales vertical bounce", () => {
    const source = humanoid();
    const target = humanoid({ scale: 2 });
    const clip = new AnimationClip("Travel", 1, [
      new VectorKeyframeTrack(
        `${source.bones.Hips.uuid}.position`,
        [0, 1],
        [0, 1, 0, 4, 1.5, 3]
      ),
    ]);
    const result = RiggingMotion.retarget(source.root, clip, target.root)!;
    pose(target, result, 0.5);
    const position = target.bones.Hips.getWorldPosition(new Vector3());
    expect(position.x).toBeCloseTo(0, 5);
    expect(position.z).toBeCloseTo(0, 5);
    expect(position.y).toBeCloseTo(2.5, 5);
    expect(
      result.tracks.filter((track) => track.name.endsWith(".position"))
    ).toHaveLength(1);
  });

  it("maps differing character headings and produces finite skinned deformation", () => {
    const source = humanoid();
    const target = humanoid({ aPose: true, heading: Math.PI / 2 });
    const restVertex = target.mesh.applyBoneTransform(
      0,
      new Vector3().fromBufferAttribute(
        target.mesh.geometry.getAttribute("position"),
        0
      )
    );
    const result = RiggingMotion.retarget(
      source.root,
      armClip(source),
      target.root
    )!;
    pose(target, result, 0.5);
    target.mesh.skeleton.update();
    const deformed = target.mesh.applyBoneTransform(
      0,
      new Vector3().fromBufferAttribute(
        target.mesh.geometry.getAttribute("position"),
        0
      )
    );
    expect(deformed.toArray().every(Number.isFinite)).toBe(true);
    expect(deformed.distanceTo(restVertex)).toBeGreaterThan(0.1);
    const direction = target.bones.LeftForeArm.getWorldPosition(new Vector3())
      .sub(target.bones.LeftArm.getWorldPosition(new Vector3()))
      .normalize();
    expect(Math.abs(direction.x)).toBeLessThan(0.001);
    expect(direction.z).toBeLessThan(-0.5);
  });

  it("retains cyclic hip sway while eliminating net travel", () => {
    const source = humanoid();
    const target = humanoid({ scale: 2 });
    const clip = new AnimationClip("Sway", 1, [
      new VectorKeyframeTrack(
        `${source.bones.Hips.uuid}.position`,
        [0, 0.5, 1],
        [0, 1, 0, 1.5, 1.2, 0.2, 2, 1, 0]
      ),
    ]);
    const result = RiggingMotion.retarget(source.root, clip, target.root)!;
    pose(target, result, 0.5);
    const position = target.bones.Hips.getWorldPosition(new Vector3());
    expect(position.x).toBeCloseTo(1, 5);
    expect(position.z).toBeCloseTo(0.4, 5);
    expect(position.y).toBeCloseTo(2.4, 5);
  });

  it("returns null for unsupported skeletons and unbounded clips", () => {
    const source = humanoid();
    const target = humanoid();
    expect(
      RiggingMotion.retarget(
        source.root,
        new AnimationClip("empty", 1, []),
        target.root
      )
    ).toBeNull();
    const tooLong = armClip(source);
    tooLong.duration = 61;
    expect(
      RiggingMotion.retarget(source.root, tooLong, target.root)
    ).toBeNull();
    target.bones.Head.name = "Unknown";
    expect(
      RiggingMotion.retarget(source.root, armClip(source), target.root)
    ).toBeNull();
  });
});

function humanoid(
  options: {
    aPose?: boolean;
    scale?: number;
    heading?: number;
    twist?: number;
  } = {}
) {
  const root = new Group();
  const bones: Record<string, Bone> = {};
  const scale = options.scale ?? 1;
  const add = (name: string, parent: string | null, position: number[]) => {
    const bone = new Bone();
    bone.name = `mixamorig:${name}`;
    bone.position.fromArray(position).multiplyScalar(scale);
    (parent ? bones[parent] : root).add(bone);
    bones[name] = bone;
    return bone;
  };
  add("Hips", null, [0, 1, 0]);
  add("Spine", "Hips", [0, 0.2, 0]);
  add("Head", "Spine", [0, 0.6, 0]);
  for (const [side, sign] of [
    ["Left", 1],
    ["Right", -1],
  ] as const) {
    const arm = add(`${side}Arm`, "Spine", [0.2 * sign, 0.4, 0]);
    arm.quaternion.setFromAxisAngle(
      new Vector3(0, 0, 1),
      -sign * (options.aPose ? Math.PI * 0.75 : Math.PI / 2)
    );
    arm.quaternion.multiply(
      new Quaternion().setFromAxisAngle(
        new Vector3(0, 1, 0),
        options.twist ?? 0
      )
    );
    add(`${side}ForeArm`, `${side}Arm`, [0, 0.4, 0]);
    add(`${side}Hand`, `${side}ForeArm`, [0, 0.3, 0]);
    const leg = add(`${side}UpLeg`, "Hips", [0.15 * sign, 0, 0]);
    leg.quaternion.setFromAxisAngle(new Vector3(0, 0, 1), Math.PI);
    add(`${side}Leg`, `${side}UpLeg`, [0, 0.5, 0]);
    add(`${side}Foot`, `${side}Leg`, [0, 0.5, 0]);
  }
  root.rotation.y = options.heading ?? 0;
  root.updateMatrixWorld(true);
  const geometry = new BufferGeometry();
  const hand = bones.LeftHand.getWorldPosition(new Vector3());
  root.worldToLocal(hand);
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(hand.toArray(), 3)
  );
  const allBones = Object.values(bones);
  geometry.setAttribute(
    "skinIndex",
    new Uint16BufferAttribute([allBones.indexOf(bones.LeftHand), 0, 0, 0], 4)
  );
  geometry.setAttribute(
    "skinWeight",
    new Float32BufferAttribute([1, 0, 0, 0], 4)
  );
  const mesh = new SkinnedMesh(geometry, new MeshBasicMaterial());
  root.add(mesh);
  mesh.bind(new Skeleton(allBones));
  return { root, bones, mesh };
}

function armClip(source: ReturnType<typeof humanoid>): AnimationClip {
  const first = source.bones.LeftArm.quaternion.clone();
  const second = new Quaternion()
    .setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 3)
    .multiply(first);
  return new AnimationClip("Dance", 1, [
    new QuaternionKeyframeTrack(
      `${source.bones.LeftArm.uuid}.quaternion`,
      [0, 1],
      [...first.toArray(), ...second.toArray()]
    ),
  ]);
}

function snapshot(asset: ReturnType<typeof humanoid>) {
  return Object.values(asset.bones).map((bone) => [
    ...bone.position.toArray(),
    ...bone.quaternion.toArray(),
  ]);
}

function pose(
  target: ReturnType<typeof humanoid>,
  clip: AnimationClip,
  time: number
) {
  const mixer = new AnimationMixer(target.root);
  mixer.clipAction(clip).play();
  mixer.setTime(time);
  target.root.updateMatrixWorld(true);
}
