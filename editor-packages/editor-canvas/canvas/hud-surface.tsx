import React from "react";
import { HoverOutlineHighlight, ReadonlySelectHightlight } from "../overlay";
import { FrameTitle, FrameTitleProps } from "../frame-title";
import type { XY, XYWH } from "../types";
import { Marquee } from "../marquee";
interface HudControls {
  onSelectNode: (node: string) => void;
  onHoverNode: (node: string) => void;
}

export interface HudCustomRenderers {
  renderFrameTitle?: (props: FrameTitleProps) => React.ReactNode;
}

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
  rotation: number;
}

export function HudSurface({
  offset,
  highlights,
  zoom,
  hide,
  labelDisplayNodes,
  selectedNodes,
  readonly,
  onSelectNode,
  onHoverNode,
  marquee,
  disableMarquee = false,
  //
  renderFrameTitle = frame_title_default_renderer,
}: {
  offset: XY;
  zoom: number;
  highlights: { id: string; xywh: XYWH; rotation: number }[];
  labelDisplayNodes: DisplayNodeMeta[];
  selectedNodes: DisplayNodeMeta[];
  hide: boolean;
  marquee?: XYWH;
  disableMarquee?: boolean;
  readonly: boolean;
} & HudControls &
  HudCustomRenderers) {
  const [ox, oy] = offset;
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
      {!disableMarquee && marquee && <Marquee rect={marquee} />}
      {!hide && (
        <>
          {labelDisplayNodes &&
            labelDisplayNodes.map((node) => {
              const absxy: XY = [node.absoluteX * zoom, node.absoluteY * zoom];
              return renderFrameTitle({
                id: node.id,
                name: node.name,
                xy: absxy,
                wh: [node.width, node.height],
                zoom: zoom,
                selected: selectedNodes.some(
                  (selectedNode) => selectedNode.id === node.id
                ),
                onSelect: () => onSelectNode(node.id),
                onHoverChange: (hv) => {
                  if (hv) {
                    onHoverNode(node.id);
                  } else {
                    onHoverNode(null);
                  }
                },
                highlight: !![...highlights, ...selectedNodes].find(
                  (n) => n.id === node.id
                ),
              });
            })}
          {highlights &&
            highlights.map((h) => {
              return (
                <HoverOutlineHighlight
                  key={h.id}
                  type="xywhr"
                  xywh={h.xywh}
                  rotation={h.rotation}
                  zoom={zoom}
                  width={2}
                />
              );
            })}
          {selectedNodes &&
            selectedNodes.map((s) => {
              const xywh: [number, number, number, number] = [
                s.absoluteX,
                s.absoluteY,
                s.width,
                s.height,
              ];
              if (readonly) {
                return (
                  <ReadonlySelectHightlight
                    key={s.id}
                    type="xywhr"
                    xywh={xywh}
                    rotation={s.rotation}
                    zoom={zoom}
                    width={1}
                  />
                );
              } else {
                // TODO: support non readonly canvas
              }
            })}
        </>
      )}
    </div>
  );
}

const frame_title_default_renderer = (p: FrameTitleProps) => (
  <FrameTitle key={p.id} {...p} />
);
