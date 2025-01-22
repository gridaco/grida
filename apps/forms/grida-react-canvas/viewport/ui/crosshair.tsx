export function Crosshair({
  size = 5,
  width = 0.5,
  color = "red",
}: {
  size?: number;
  width?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      style={{ position: "relative", display: "block" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Diagonal line from top-left to bottom-right */}
      <line
        x1={0}
        y1={0}
        x2={size}
        y2={size}
        stroke={color}
        strokeWidth={width}
      />
      {/* Diagonal line from top-right to bottom-left */}
      <line
        x1={size}
        y1={0}
        x2={0}
        y2={size}
        stroke={color}
        strokeWidth={width}
      />
    </svg>
  );
}
