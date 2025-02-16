import React, { useState } from "react";
import { useHover } from "@editor-ui/hooks";
import type { FrameTitleProps } from "@code-editor/canvas/frame-title";
import {
  FrameTitleContainer,
  FrameTitleLabel,
} from "@code-editor/canvas/frame-title";
import { PlayIcon } from "@radix-ui/react-icons";
export function ViewportTitleRenderer({
  name,
  xy,
  wh,
  zoom,
  highlight = false,
  selected,
  onHoverChange,
  onSelect,
  onDoubleClick,
  onRunClick,
  runnable = false,
}: FrameTitleProps & {
  runnable?: boolean;
  onRunClick?: () => void;
  onDoubleClick?: () => void;
}) {
  const [x, y] = xy;
  const [w, h] = wh;
  const view_height = 80;

  const height_considered_y_transform = y - view_height;

  const [hoverred, setHoverred] = useState(false);

  const _onHoverChange = (hover) => {
    setHoverred(hover);
    onHoverChange?.(hover);
  };

  const { hoverProps } = useHover({
    onHoverChange: _onHoverChange,
  });

  return (
    <FrameTitleContainer
      id="viewport-title"
      onClick={onSelect}
      onContextMenu={onSelect}
      width={selected ? Math.max(w * zoom, 40) : w * zoom}
      height={view_height}
      zIndex={selected ? 1 : 0}
      xy={[x, height_considered_y_transform]}
      {...hoverProps}
    >
      <div
        data-selected={selected}
        className="flex flex-row p-4 gap-4 rounded-xl w-full shadow-md items-center bg-neutral-500 data-[selected=true]:bg-blue-400"
      >
        {runnable && (
          <button
            onPointerDown={(e) => {
              // this is required to prevent the canvas' event listener being called first.
              e.stopPropagation();
              e.preventDefault();
            }}
            onClick={onRunClick}
          >
            <PlayIcon color="white" width={24} height={24} />
          </button>
        )}
        <FrameTitleLabel
          onDoubleClick={onDoubleClick}
          color={
            selected || highlight || hoverred
              ? "rgba(255,255,255,1)"
              : "rgba(255,255,255,0.5)"
          }
        >
          {name}
        </FrameTitleLabel>
      </div>
    </FrameTitleContainer>
  );
}
