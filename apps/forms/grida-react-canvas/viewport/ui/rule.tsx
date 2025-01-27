export function Rule({
  axis,
  offset,
  width = 0.5,
}: {
  axis: "x" | "y";
  offset: number;
  width?: number;
}) {
  return (
    <svg
      style={{
        position: "absolute",
        width: axis === "x" ? "100%" : `${width}px`,
        height: axis === "y" ? "100%" : `${width}px`,
        willChange: "transform",
        pointerEvents: "none",
        transform:
          axis === "x"
            ? `translate3d(0, ${offset - width / 2}px, 0)`
            : `translate3d(${offset - width / 2}px, 0, 0)`,
      }}
    >
      <line
        x1={axis === "x" ? 0 : width / 2}
        y1={axis === "y" ? 0 : width / 2}
        x2={axis === "x" ? "100%" : width / 2}
        y2={axis === "y" ? "100%" : width / 2}
        stroke="red"
        strokeWidth={width}
        strokeLinecap="square"
      />
    </svg>
  );
}
