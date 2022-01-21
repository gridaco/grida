import styled from "@emotion/styled";

export function FrameTitle({
  name,
  xywh,
  zoom,
}: {
  name: string;
  /**
   * absolute x, y and width, height
   */
  xywh: [number, number, number, number];
  zoom: number;
}) {
  const [x, y, w, h] = xywh;
  const height = 24;
  return (
    <div
      id="frame-title"
      style={{
        position: "fixed",
        width: w * zoom,
        height: height,
        fontSize: 12,
        willChange: "transform",
        cursor: "default",
        overflow: "hidden",
        transform: `translateX(${x * zoom}px) translateY(${
          y * zoom - height
        }px)`,
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
