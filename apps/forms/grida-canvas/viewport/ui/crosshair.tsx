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
    <div style={{ position: "relative", width: size, height: size }}>
      {/* Diagonal line from top-left to bottom-right */}
      <div
        style={{
          position: "absolute",
          width: "100%",
          height: width,
          backgroundColor: color,
          transform: "rotate(45deg)",
          top: "50%",
          left: "0",
          transformOrigin: "center",
        }}
      />

      {/* Diagonal line from top-right to bottom-left */}
      <div
        style={{
          position: "absolute",
          width: "100%",
          height: width,
          backgroundColor: color,
          transform: "rotate(-45deg)",
          top: "50%",
          left: "0",
          transformOrigin: "center",
        }}
      />
    </div>
  );
}
