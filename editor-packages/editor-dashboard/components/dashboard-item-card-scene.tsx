import React, { useRef } from "react";
import type { ReflectSceneNode } from "@design-sdk/figma-node";
import { FigmaNodeBitmapView } from "@code-editor/canvas-renderer-bitmap";
import { SceneNodeIcon } from "@code-editor/node-icons";
import { useInViewport } from "react-in-viewport";
import {
  DashboardItemCard,
  DashboardItemCardProps,
} from "./dashboard-item-card";

function SceneCardPreview({
  maxWidth,
  scene,
}: {
  maxWidth: number;
  scene: ReflectSceneNode;
}) {
  const visibilityRef = useRef();

  const { enterCount } = useInViewport(visibilityRef);

  // max allowed zoom = 1
  const scale = Math.min(maxWidth / scene.width, 1);
  const { height, type } = scene;

  return (
    <div
      ref={visibilityRef}
      style={{
        height: height * scale,
        width: maxWidth,
      }}
    >
      {/* transformer */}
      <div
        id="view"
        style={{
          transform: `scale(${scale})`,
        }}
      >
        <FigmaNodeBitmapView
          background={"white"}
          key={scene.id}
          target={scene}
          isPanning={false}
          isZooming={false}
          zoom={null}
          inViewport={enterCount > 0}
          focused={false}
        />
      </div>
    </div>
  );

  //
}

export interface SceneCardProps
  extends Omit<DashboardItemCardProps, "icon" | "preview" | "label"> {
  scene: ReflectSceneNode;
}

export const SceneCard = React.forwardRef(function (
  { scene, ...props }: SceneCardProps,
  ref: React.Ref<HTMLDivElement>
) {
  return (
    <DashboardItemCard
      ref={ref}
      {...props}
      label={scene.name}
      icon={<SceneNodeIcon type={scene.type} color="white" />}
      preview={<SceneCardPreview scene={scene} maxWidth={300} />}
    />
  );
});
