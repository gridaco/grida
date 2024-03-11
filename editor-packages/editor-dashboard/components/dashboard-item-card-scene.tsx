import React, { useRef } from "react";
import { FigmaNodeBitmapView } from "@code-editor/canvas-renderer-bitmap";
import { SceneNodeIcon } from "@code-editor/node-icons";
import { useInViewport } from "react-in-viewport";
import {
  DashboardItemCard,
  DashboardItemCardProps,
} from "./dashboard-item-card";

const MAX_WIDTH = 240;

type SceneMeta = {
  id: string;
  filekey: string;
  name: string;
  width: number;
  height: number;
  type: any;
};

function SceneCardPreview({
  maxWidth,
  scene,
}: {
  maxWidth: number;
  scene: SceneMeta;
}) {
  const visibilityRef = useRef<HTMLDivElement>(null);

  const { enterCount } = useInViewport(visibilityRef);

  // max allowed zoom = 1
  const scale = Math.min(maxWidth / scene.width, 1);
  const { height: h, type } = scene;
  const height = h * scale; // fixme: this is somethimes NaN

  return (
    <div
      ref={visibilityRef}
      className="scale-on-over"
      style={{
        height: isNaN(height) ? "auto" : height,
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
          zoom={1}
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
  scene: SceneMeta;
}

export const SceneCard = React.forwardRef(function (
  { scene, ...props }: SceneCardProps,
  ref: React.Ref<HTMLDivElement>
) {
  return (
    <DashboardItemCard
      ref={ref}
      id={props.id}
      {...props}
      label={scene.name}
      icon={<SceneNodeIcon type={scene.type} color="white" />}
      preview={<SceneCardPreview scene={scene} maxWidth={MAX_WIDTH} />}
    />
  );
});
