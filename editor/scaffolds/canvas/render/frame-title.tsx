import React, { useState } from "react";
import { useHover } from "@editor-ui/hooks";
import type { FrameTitleProps } from "@code-editor/canvas/frame-title";
import {
  FrameTitleContainer,
  FrameTitleLabel,
} from "@code-editor/canvas/frame-title";
import { color_frame_title } from "@code-editor/canvas/theme";

export function FrameTitleRenderer({
  name,
  xy,
  wh,
  zoom,
  highlight = false,
  selected,
  onHoverChange,
  onSelect,
  onRunClick,
}: FrameTitleProps & {
  onRunClick: () => void;
}) {
  const [x, y] = xy;
  const [w, h] = wh;
  const view_height = 24;

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
      id="frame-title"
      onClick={onSelect}
      width={selected ? Math.max(w * zoom, 40) : w * zoom}
      height={view_height}
      zIndex={selected ? 1 : 0}
      xy={[x, height_considered_y_transform]}
      {...hoverProps}
    >
      {selected && <SelectedStatePrimaryAction onClick={onRunClick} />}
      <FrameTitleLabel
        color={
          selected || highlight || hoverred
            ? color_frame_title.highlight
            : color_frame_title.default
        }
      >
        {name}
      </FrameTitleLabel>
    </FrameTitleContainer>
  );
}

function SelectedStatePrimaryAction({ onClick }: { onClick: () => void }) {
  return (
    <span
      onClick={onClick}
      onPointerDown={(e) => {
        // this is required to prevent the canvas' event listener being called first.
        e.stopPropagation();
        e.preventDefault();
      }}
      style={{
        marginRight: 4,
        cursor: "pointer",
      }}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M10 0C4.48 0 0 4.48 0 10C0 15.52 4.48 20 10 20C15.52 20 20 15.52 20 10C20 4.48 15.52 0 10 0ZM8 14.5V5.5L14 10L8 14.5Z"
          fill="#52A1FF"
        />
      </svg>
    </span>
  );
}
