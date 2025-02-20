import React, { useState } from "react";
import { useHover } from "@editor-ui/hooks";
import styled from "@emotion/styled";
import { color_frame_title } from "../theme";

export interface FrameTitleProps {
  id?: string;
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
  selected?: boolean;
  onHoverChange?: (hover: boolean) => void;
  onSelect?: () => void;
}

export function FrameTitle({
  name,
  xy,
  wh,
  zoom,
  highlight = false,
  selected,
  onHoverChange,
  onSelect,
}: FrameTitleProps) {
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
      onContextMenu={onSelect}
      width={w * zoom}
      height={view_height}
      xy={[x, height_considered_y_transform]}
      {...hoverProps}
    >
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

export const FrameTitleContainer = styled.div<{
  width: number;
  height: number;
  zIndex?: number;
  xy: [number, number];
}>`
  position: fixed;
  width: ${(p) => p.width}px;
  height: ${(p) => p.height}px;
  will-change: transform;
  cursor: default;
  overflow: hidden;
  transform: translateX(${(p) => p.xy[0]}px) translateY(${(p) => p.xy[1]}px);
  display: flex;
  font-size: 12px;
  flex-direction: row;
  align-items: center;
  z-index: ${(p) => p.zIndex ?? 0};
`;

export const FrameTitleLabel = styled.span<{
  color: string;
}>`
  color: ${(p) => p.color};
  user-select: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;
