import React from "react";
import {
  HoverOutlineHighlight,
  ReadonlySelectHightlight,
  InSelectionGroupSelectHighlight,
  SelectHightlight,
  SizeMeterLabel,
  PositionGuide,
} from "../overlay";
import { FrameTitle, FrameTitleProps } from "../frame-title";
import type { Box, XY, XYWH } from "../types";
import { Marquee } from "../marquee";
import { boundingbox, box_to_xywh } from "../math";
import type { ResizeHandleOrigin } from "../overlay/types";

interface HudControls {
  onSelectNode: (node: string) => void;
  onHoverNode: (node: string | null) => void;
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

/**
 * Position guide display between a, b. where a, b represented as a bounding box.
 */
interface PositionGuideMeta {
  a: Box;
  b: Box;
}

export function HudSurface({
  offset,
  zoom,
  hide,
  highlights = [],
  labelDisplayNodes = [],
  selectedNodes = [],
  positionGuides = [],
  readonly,
  disableGrouping = false,
  onSelectNode,
  onHoverNode,
  marquee,
  disableMarquee = false,
  //
  renderFrameTitle = frame_title_default_renderer,
  onSelectionResize,
}: {
  offset: XY;
  zoom: number;
  highlights?: { id: string; xywh: XYWH; rotation: number }[];
  positionGuides?: PositionGuideMeta[];
  labelDisplayNodes?: DisplayNodeMeta[];
  selectedNodes?: DisplayNodeMeta[];
  hide: boolean;
  marquee?: XYWH | null;
  disableMarquee?: boolean;
  disableGrouping?: boolean;
  readonly: boolean;
  onSelectionResize?: (
    handle: ResizeHandleOrigin,
    delta: [number, number],
    meta: { altKey: boolean; shiftKey: boolean }
  ) => void;
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
          {/* position guide above all other generic overlays */}
          {positionGuides.length > 0 && (
            <PositionGuides guides={positionGuides} zoom={zoom} />
          )}

          {labelDisplayNodes && (
            <div id="labels">
              {labelDisplayNodes.map((node) => {
                const absxy: XY = [
                  node.absoluteX * zoom,
                  node.absoluteY * zoom,
                ];
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
            </div>
          )}

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

          {selectedNodes.length > 0 && (
            <SelectionsHighlight
              selections={selectedNodes}
              zoom={zoom}
              readonly={readonly}
              disableGrouping={disableGrouping}
              onResize={onSelectionResize}
            />
          )}
        </>
      )}
    </div>
  );
}

/**
 * this only supports readonly mode for now.
 */
function PositionGuides({
  guides,
  zoom,
}: {
  guides: PositionGuideMeta[];
  zoom: number;
}) {
  return (
    <>
      {guides.map((guide, i) => {
        return <PositionGuide key={i} a={guide.a} b={guide.b} zoom={zoom} />;
      })}
    </>
  );
}

// interface PositioningGuidePreferences{
// }

function SelectionsHighlight({
  selections,
  zoom,
  disableSizeDisplay = false,
  disableGrouping,
  readonly,
  onResize,
}: {
  readonly: boolean;
  selections: DisplayNodeMeta[];
  zoom: number;
  disableGrouping?: boolean;
  disableSizeDisplay?: boolean;
  onResize?: (
    handle: ResizeHandleOrigin,
    delta: [number, number],
    meta: { altKey: boolean; shiftKey: boolean }
  ) => void;
}) {
  if (disableGrouping) {
    return (
      <>
        {selections.map((s) => {
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
            return (
              <SelectHightlight
                key={s.id}
                type="xywhr"
                xywh={xywh}
                rotation={s.rotation}
                zoom={zoom}
              />
            );
          }
        })}
      </>
    );
  }

  const box = boundingbox(
    selections.map((d) => {
      return [d.absoluteX, d.absoluteY, d.width, d.height, d.rotation];
    }),
    2
  );

  const xywh = box_to_xywh(box);
  const [x, y, w, h] = xywh;

  return (
    <>
      <>
        {selections.map((s) => {
          return (
            <InSelectionGroupSelectHighlight
              key={s.id}
              type={"xywhr"}
              xywh={[s.absoluteX, s.absoluteY, s.width, s.height]}
              zoom={zoom}
            />
          );
        })}
      </>
      <>
        {!disableSizeDisplay ? (
          <SizeMeterLabel
            box={box}
            zoom={zoom}
            margin={8}
            size={{
              width: w,
              height: h,
            }}
          />
        ) : (
          <></>
        )}
      </>
      {readonly ? (
        <ReadonlySelectHightlight
          key={"selections-highlight"}
          type="xywhr"
          xywh={xywh}
          rotation={0}
          zoom={zoom}
        />
      ) : (
        <SelectHightlight
          key={"selections-highlight"}
          type="xywhr"
          xywh={xywh}
          rotation={0}
          zoom={zoom}
          onResize={onResize}
        />
      )}
    </>
  );
}

const frame_title_default_renderer = (p: FrameTitleProps) => (
  <FrameTitle key={p.id} {...p} />
);
