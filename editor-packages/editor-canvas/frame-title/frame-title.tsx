import React, { useState } from "react";
import { useHover } from "@editor-ui/hooks";
import styled from "@emotion/styled";
import { color_frame_title } from "../theme";

export function FrameTitle({
  name,
  xy,
  wh,
  zoom,
  highlight = false,
  onHoverChange,
  onSelect,
}: {
  name: string;
  /**
   * absolute x, y
   */
  xy: [number, number];
  /**
   * width, height
   */
  wh: [number, number];
  zoom: number;
  highlight?: boolean;
  onHoverChange?: (hover: boolean) => void;
  onSelect?: () => void;
}) {
  const [x, y] = xy;
  const [w, h] = wh;
  const view_height = 20;

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
    <div
      id="frame-title"
      onClick={onSelect}
      style={{
        position: "fixed",
        width: w * zoom,
        height: view_height,
        fontSize: 12,
        willChange: "transform",
        cursor: "default",
        overflow: "hidden",
        transform: `translateX(${x}px) translateY(${height_considered_y_transform}px)`,
        display: "flex",
        flexDirection: "row",
      }}
      {...hoverProps}
    >
      <TitleLabel
        color={
          highlight || hoverred
            ? color_frame_title.highlight
            : color_frame_title.default
        }
      >
        {name}
      </TitleLabel>
    </div>
  );
}

const TitleLabel = styled.span<{
  color: string;
}>`
  color: ${(p) => p.color};
  user-select: none;
  text-overflow: ellipsis;
`;
