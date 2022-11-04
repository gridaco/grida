import { ReflectSceneNode, ReflectSceneNodeType } from "@design-sdk/figma-node";
import type { FrameOptimizationFactors } from "@code-editor/canvas/frame";
import { FigmaStaticImageFrameView } from "./image-preview";
import { D2CVanillaPreview } from "./vanilla-preview-async";

function _check_by_type(type: ReflectSceneNodeType) {
  switch (type) {
    case ReflectSceneNodeType.line:
    case ReflectSceneNodeType.text:
      return "vanilla";
    default: {
      // pass
      return "next";
    }
  }
}

function optimized_preview_strategy(
  scene: ReflectSceneNode
): "vanilla" | "baked" | "next" {
  const { children, type, width, height } = scene;

  const _typecheck = _check_by_type(type);
  if (_typecheck !== "next") {
    return _typecheck;
  }

  switch (type) {
    case ReflectSceneNodeType.line:
    case ReflectSceneNodeType.text:
      return "vanilla";
    default: {
      // pass
    }
  }

  if (children.length === 0) {
    const hasimagefill = scene.fills
      ?.filter(Boolean)
      ?.filter((f) => f.visible)
      ?.find((f) => f.type === "IMAGE");

    if (hasimagefill) {
      return "baked";
    } else {
      return "vanilla";
    }
  } else if (children.length === 1) {
    return optimized_preview_strategy(children[0]);
  } else {
    // if children is all vanilla, then render vanilla.
    const all_vanilla = children.every((c) => {
      return _check_by_type(type) === "vanilla";
    });
    if (all_vanilla) {
      return "vanilla";
    }
  }

  return "baked";
}

export function OptimizedPreviewCanvas({
  target,
  ...props
}: {
  target: ReflectSceneNode;
} & FrameOptimizationFactors) {
  switch (optimized_preview_strategy(target)) {
    case "baked":
      return <FigmaStaticImageFrameView target={target} {...props} />;
    case "vanilla":
      return <D2CVanillaPreview target={target} {...props} />;
    default:
      return <>TODO</>;
  }
}
