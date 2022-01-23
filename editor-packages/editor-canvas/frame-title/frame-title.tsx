import styled from "@emotion/styled";
import { color_frame_title } from "../theme";

export function FrameTitle({
  name,
  xy,
  wh,
  zoom,
  highlight = false,
  onHoverStart,
  onHoverEnd,
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
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
}) {
  const [x, y] = xy;
  const [w, h] = wh;
  const view_height = 20;

  const height_considered_y_transform = y - view_height;

  return (
    <div
      id="frame-title"
      style={{
        position: "fixed",
        width: w * zoom,
        height: view_height,
        fontSize: 12,
        willChange: "transform",
        cursor: "default",
        overflow: "hidden",
        transform: `translateX(${x}px) translateY(${height_considered_y_transform}px)`,
      }}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
    >
      <TitleLabel
        color={
          highlight ? color_frame_title.highlight : color_frame_title.default
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
