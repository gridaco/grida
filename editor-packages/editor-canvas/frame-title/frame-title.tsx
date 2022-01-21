import styled from "@emotion/styled";

export function FrameTitle({
  name,
  xy,
  wh,
  zoom,
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
    >
      <TitleLabel>{name}</TitleLabel>
    </div>
  );
}

const TitleLabel = styled.span`
  color: grey;
  user-select: none;
  text-overflow: ellipsis;
`;
