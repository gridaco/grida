import {
  AnimationClip,
  AnimationMixer,
  Bone,
  Matrix4,
  Object3D,
  Quaternion,
  QuaternionKeyframeTrack,
  SkinnedMesh,
  Vector3,
  VectorKeyframeTrack,
} from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";

/** Retarget a preview motion without changing either asset or its bind pose. */
export namespace RiggingMotion {
  /** Fixed application previews; each motion retains its own source license. */
  export const presets = [
    {
      id: "dance",
      label: "Dance",
      src: "/assets/motions/dance.glb",
      attribution: "Quaternius · CC0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    },
    {
      id: "samba",
      label: "Samba",
      src: "/assets/motions/samba.glb",
      attribution: "Mixamo · Adobe terms",
      licenseUrl: "https://www.adobe.com/legal/terms.html",
    },
  ] as const;

  export type PresetId = (typeof presets)[number]["id"];

  type Joint =
    | "hips"
    | "spine"
    | "chest"
    | "upperChest"
    | "neck"
    | "head"
    | "leftShoulder"
    | "leftArm"
    | "leftForeArm"
    | "leftHand"
    | "rightShoulder"
    | "rightArm"
    | "rightForeArm"
    | "rightHand"
    | "leftUpLeg"
    | "leftLeg"
    | "leftFoot"
    | "leftToe"
    | "rightUpLeg"
    | "rightLeg"
    | "rightFoot"
    | "rightToe";

  type Joints = Map<Joint, Bone>;

  const aliases: Record<Joint, readonly string[]> = {
    hips: ["hips", "hip", "pelvis"],
    spine: ["spine", "spine0", "spine00", "spine01", "spine001"],
    chest: ["spine1", "spine02", "spine002", "chest"],
    upperChest: ["spine2", "spine03", "spine003", "upperchest"],
    neck: ["neck", "neck0", "neck01"],
    head: ["head", "head0", "head01"],
    leftShoulder: ["leftshoulder", "shoulderl", "claviclel", "lshoulder"],
    leftArm: ["leftarm", "upperarml", "arml", "leftupperarm", "lupperarm"],
    leftForeArm: [
      "leftforearm",
      "forearml",
      "lowerarml",
      "leftlowerarm",
      "lforearm",
    ],
    leftHand: ["lefthand", "handl", "lhand"],
    rightShoulder: ["rightshoulder", "shoulderr", "clavicler", "rshoulder"],
    rightArm: ["rightarm", "upperarmr", "armr", "rightupperarm", "rupperarm"],
    rightForeArm: [
      "rightforearm",
      "forearmr",
      "lowerarmr",
      "rightlowerarm",
      "rforearm",
    ],
    rightHand: ["righthand", "handr", "rhand"],
    leftUpLeg: [
      "leftupleg",
      "thighl",
      "upperlegl",
      "leftthigh",
      "leftupperleg",
      "lthigh",
    ],
    leftLeg: [
      "leftleg",
      "shinl",
      "calfl",
      "lowerlegl",
      "leftlowerleg",
      "lcalf",
    ],
    leftFoot: ["leftfoot", "footl", "lfoot"],
    leftToe: ["lefttoebase", "lefttoe", "toel", "toesl", "ltoe"],
    rightUpLeg: [
      "rightupleg",
      "thighr",
      "upperlegr",
      "rightthigh",
      "rightupperleg",
      "rthigh",
    ],
    rightLeg: [
      "rightleg",
      "shinr",
      "calfr",
      "lowerlegr",
      "rightlowerleg",
      "rcalf",
    ],
    rightFoot: ["rightfoot", "footr", "rfoot"],
    rightToe: ["righttoebase", "righttoe", "toer", "toesr", "rtoe"],
  };

  const chains: readonly (readonly Joint[])[] = [
    ["hips", "spine", "head"],
    ["spine", "leftArm", "leftForeArm", "leftHand"],
    ["spine", "rightArm", "rightForeArm", "rightHand"],
    ["hips", "leftUpLeg", "leftLeg", "leftFoot"],
    ["hips", "rightUpLeg", "rightLeg", "rightFoot"],
  ];

  /** A complete, named two-arm/two-leg hierarchy is required, not just a skin. */
  export function supports(target: Object3D): boolean {
    return joints(target) !== null;
  }

  /**
   * Bake at 30 Hz onto the target's bone UUIDs. Rotations compensate both bind
   * axes and anatomical A/T pose differences. Bone lengths stay untouched;
   * hip sway and bounce are scaled by leg length, with horizontal travel
   * between the clip's start and end removed to keep the loop in place.
   * This is a bounded, in-place preview, not contact-aware motion synthesis.
   */
  export function retarget(
    source: Object3D,
    clip: AnimationClip,
    target: Object3D
  ): AnimationClip | null {
    if (
      !supports(source) ||
      !supports(target) ||
      !Number.isFinite(clip.duration) ||
      clip.duration <= 0 ||
      clip.duration > 60 ||
      clip.tracks.length === 0
    )
      return null;

    const sourceRoot = restClone(source);
    const targetRoot = restClone(target);
    const sourceJoints = joints(sourceRoot)!;
    const targetJoints = joints(targetRoot)!;
    const sourceFrame = bodyFrame(sourceJoints);
    const targetFrame = bodyFrame(targetJoints);
    if (!sourceFrame || !targetFrame) return null;
    const bodyAlignment = targetFrame
      .clone()
      .multiply(sourceFrame.clone().invert());
    const sourceForward = new Vector3(0, 0, 1).applyQuaternion(sourceFrame);
    const targetForward = new Vector3(0, 0, 1).applyQuaternion(targetFrame);
    const sourceUp = new Vector3(0, 1, 0).applyQuaternion(sourceFrame);

    const bindings: {
      source: Bone;
      target: Bone;
      correction: Quaternion;
      values: number[];
    }[] = [];
    // Traverse in target hierarchy order so each parent's animated world
    // transform is available when deriving its child's local rotation.
    targetRoot.traverse((node) => {
      if (!(node instanceof Bone)) return;
      const key = [...targetJoints].find(([, bone]) => bone === node)?.[0];
      if (!key) return;
      const sourceBone = sourceJoints.get(key);
      if (!sourceBone) return;
      const sourceRest = sourceBone.getWorldQuaternion(new Quaternion());
      const targetRest = node.getWorldQuaternion(new Quaternion());
      const sourceAxis = jointFrame(key, sourceJoints, sourceForward);
      const targetAxis = jointFrame(key, targetJoints, targetForward);
      const correction = sourceRest.clone().invert();
      if (sourceAxis && targetAxis) {
        correction.multiply(sourceAxis).multiply(targetAxis.invert());
      } else {
        correction.multiply(bodyAlignment.clone().invert());
      }
      correction.multiply(targetRest);
      bindings.push({
        source: sourceBone,
        target: node,
        correction,
        values: [],
      });
    });

    const sourceHips = sourceJoints.get("hips")!;
    const targetHips = targetJoints.get("hips")!;
    const targetHipRest = targetHips.getWorldPosition(new Vector3());
    const proportion = legLength(targetJoints) / legLength(sourceJoints);
    if (!Number.isFinite(proportion) || proportion <= 0) return null;
    const mixer = new AnimationMixer(sourceRoot);
    const action = mixer.clipAction(clip);
    action.play();
    const frames = Math.ceil(clip.duration * 30);
    const times: number[] = [];
    const positions: number[] = [];
    mixer.setTime(0);
    sourceRoot.updateMatrixWorld(true);
    const initialHip = sourceHips.getWorldPosition(new Vector3());
    mixer.setTime(Math.max(0, clip.duration - 1e-7));
    sourceRoot.updateMatrixWorld(true);
    const horizontalTravel = sourceHips
      .getWorldPosition(new Vector3())
      .sub(initialHip);
    horizontalTravel.addScaledVector(sourceUp, -horizontalTravel.dot(sourceUp));
    const worldRotation = new Quaternion();
    const parentRotation = new Quaternion();
    const worldPosition = new Vector3();

    for (let frame = 0; frame <= frames; frame += 1) {
      const time = Math.min(frame / 30, clip.duration);
      // Avoid AnimationMixer looping to zero at the final keyframe.
      mixer.setTime(Math.min(time, Math.max(0, clip.duration - 1e-7)));
      sourceRoot.updateMatrixWorld(true);
      times.push(time);
      for (const binding of bindings) {
        worldRotation
          .copy(bodyAlignment)
          .multiply(binding.source.getWorldQuaternion(new Quaternion()))
          .multiply(binding.correction);
        if (binding.target.parent) {
          binding.target.parent.getWorldQuaternion(parentRotation).invert();
          worldRotation.premultiply(parentRotation);
        }
        binding.target.quaternion.copy(worldRotation).normalize();
        binding.target.updateMatrixWorld(true);
        binding.target.quaternion.toArray(
          binding.values,
          binding.values.length
        );
      }
      sourceHips
        .getWorldPosition(worldPosition)
        .sub(initialHip)
        .addScaledVector(horizontalTravel, -time / clip.duration)
        .applyQuaternion(bodyAlignment)
        .multiplyScalar(proportion)
        .add(targetHipRest);
      targetHips.parent?.worldToLocal(worldPosition);
      worldPosition.toArray(positions, positions.length);
    }
    mixer.stopAllAction();
    mixer.uncacheRoot(sourceRoot);
    if (
      positions.some((value) => !Number.isFinite(value)) ||
      bindings.some(({ values }) =>
        values.some((value) => !Number.isFinite(value))
      )
    ) {
      return null;
    }
    const tracks = bindings.map(
      ({ target: bone, values }) =>
        new QuaternionKeyframeTrack(`${bone.uuid}.quaternion`, times, values)
    );
    return new AnimationClip(clip.name, clip.duration, [
      ...tracks,
      new VectorKeyframeTrack(`${targetHips.uuid}.position`, times, positions),
    ]);
  }

  function joints(root: Object3D): Joints | null {
    const result: Joints = new Map();
    let ambiguous = false;
    root.traverse((node) => {
      if (!(node instanceof Bone)) return;
      const name = node.name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .replace(/^(mixamorig\d*|tripo|def)/, "");
      for (const [joint, names] of Object.entries(aliases)) {
        if (!names.includes(name)) continue;
        if (result.has(joint as Joint)) ambiguous = true;
        result.set(joint as Joint, node);
      }
    });
    if (ambiguous) return null;
    for (const chain of chains) {
      for (let index = 0; index < chain.length; index += 1) {
        const bone = result.get(chain[index]);
        if (!bone) return null;
        if (index > 0 && !descendsFrom(bone, result.get(chain[index - 1])!)) {
          return null;
        }
      }
    }
    return result;
  }

  function descendsFrom(bone: Bone, ancestor: Bone): boolean {
    let parent = bone.parent;
    while (parent) {
      if (parent === ancestor) return true;
      parent = parent.parent;
    }
    return false;
  }

  function restClone(root: Object3D): Object3D {
    const result = clone(root);
    const copyIds = (original: Object3D, copied: Object3D): void => {
      // Private working scenes may share IDs. Source tracks keep resolving,
      // while output tracks address the original target instead of its clone.
      copied.uuid = original.uuid;
      original.children.forEach((child, index) =>
        copyIds(child, copied.children[index])
      );
    };
    copyIds(root, result);
    result.updateMatrixWorld(true);
    const bindWorld = new Map<Bone, Matrix4>();
    result.traverse((node) => {
      if (!(node instanceof SkinnedMesh)) return;
      node.skeleton.bones.forEach((bone, index) => {
        bindWorld.set(bone, node.skeleton.boneInverses[index].clone().invert());
      });
    });
    result.traverse((node) => {
      if (!(node instanceof Bone)) return;
      const matrix = bindWorld.get(node);
      if (!matrix) return;
      // Account for non-bone armature containers as well as bone parents.
      // Skeleton.pose() assumes the root bone's parent has no transform.
      const local = node.parent
        ? node.parent.matrixWorld.clone().invert().multiply(matrix)
        : matrix;
      local.decompose(node.position, node.quaternion, node.scale);
      node.updateMatrixWorld(true);
    });
    return result;
  }

  function bodyFrame(bones: Joints): Quaternion | null {
    const x = position(bones, "leftUpLeg").sub(position(bones, "rightUpLeg"));
    const y = position(bones, "head").sub(position(bones, "hips"));
    if (x.lengthSq() < 1e-10 || y.lengthSq() < 1e-10) return null;
    x.normalize();
    y.addScaledVector(x, -y.dot(x)).normalize();
    const z = new Vector3().crossVectors(x, y).normalize();
    if (z.lengthSq() < 0.5) return null;
    return new Quaternion().setFromRotationMatrix(
      new Matrix4().makeBasis(x, y, z)
    );
  }

  function jointFrame(
    key: Joint,
    bones: Joints,
    forward: Vector3
  ): Quaternion | null {
    const successors: Partial<Record<Joint, readonly Joint[]>> = {
      hips: ["spine"],
      spine: ["chest", "upperChest", "neck", "head"],
      chest: ["upperChest", "neck", "head"],
      upperChest: ["neck", "head"],
      neck: ["head"],
      leftShoulder: ["leftArm"],
      leftArm: ["leftForeArm"],
      leftForeArm: ["leftHand"],
      rightShoulder: ["rightArm"],
      rightArm: ["rightForeArm"],
      rightForeArm: ["rightHand"],
      leftUpLeg: ["leftLeg"],
      leftLeg: ["leftFoot"],
      leftFoot: ["leftToe"],
      rightUpLeg: ["rightLeg"],
      rightLeg: ["rightFoot"],
      rightFoot: ["rightToe"],
    };
    const next = successors[key]?.find((candidate) => bones.has(candidate));
    if (!next) return null;
    const y = position(bones, next).sub(position(bones, key));
    if (y.lengthSq() < 1e-10) return null;
    y.normalize();
    const z = forward.clone().addScaledVector(y, -forward.dot(y));
    if (z.lengthSq() < 1e-10) return null;
    z.normalize();
    const x = new Vector3().crossVectors(y, z).normalize();
    return new Quaternion().setFromRotationMatrix(
      new Matrix4().makeBasis(x, y, z)
    );
  }

  function position(bones: Joints, key: Joint): Vector3 {
    return bones.get(key)!.getWorldPosition(new Vector3());
  }

  function legLength(bones: Joints): number {
    return (
      position(bones, "leftUpLeg").distanceTo(position(bones, "leftLeg")) +
      position(bones, "leftLeg").distanceTo(position(bones, "leftFoot"))
    );
  }
}
