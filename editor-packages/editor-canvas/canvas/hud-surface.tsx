import { HoverOutlineHighlight, ReadonlySelectHightlight } from "../overlay";
import { FrameTitle } from "../frame-title";
import type { XY, XYWH } from "../types";

/**
 * minimum meta of displaying nodes for hud surface
 */
export interface DisplayNodeMeta {
  id: string;
  name: string;
  absoluteX: number;
  absoluteY: number;
  width: number;
  height: number;
}

export function HudSurface({
  xy,
  highlights,
  zoom,
  hide,
  labelDisplayNodes,
}: {
  xy: XY;
  highlights: { id: string; xywh: XYWH }[];
  labelDisplayNodes: DisplayNodeMeta[];
  zoom: number;
  hide: boolean;
}) {
  const [ox, oy] = xy;
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: 0,
        height: 0,
        willChange: "transform",
        transform: `translateX(${ox * zoom}px) translateY(${oy * zoom}px)`,
        opacity: hide ? 0 : 1,
        isolation: "isolate",
        transition: "opacity 0.15s ease 0s",
      }}
      id="hud-surface"
    >
      {labelDisplayNodes &&
        labelDisplayNodes.map((node) => {
          const absxy: XY = [node.absoluteX * zoom, node.absoluteY * zoom];
          return (
            <FrameTitle
              name={node.name}
              xy={absxy}
              wh={[node.width, node.height]}
              zoom={zoom}
              onHoverStart={() => {}}
              onHoverEnd={() => {}}
            />
          );
        })}
      {highlights &&
        highlights.map((h) => {
          return (
            <ReadonlySelectHightlight
              key={h.id}
              type="xywhr"
              xywh={h.xywh}
              zoom={zoom}
              width={2}
            />
          );
        })}
    </div>
  );
}
