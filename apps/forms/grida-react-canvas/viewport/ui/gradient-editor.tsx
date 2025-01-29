import { useSurfaceGradientEditor } from "@/grida-react-canvas/provider";
import { useNodeSurfaceTransfrom } from "../surface-hooks";

export function SurfaceGradientEditor({ node_id }: { node_id: string }) {
  const { transform, stops } = useSurfaceGradientEditor();
  const data = useNodeSurfaceTransfrom(node_id);
  if (!data) return <></>;

  return (
    <div
      id="gradient-editor-surface"
      className="fixed left-0 top-0 w-0 h-0 z-10"
    >
      <div
        style={{
          position: "absolute",
          ...data.style,
          willChange: "transform",
          overflow: "visible",
          resize: "none",
          zIndex: 1,
        }}
      >
        <GradientLine
          transform={transform}
          // test
          rect={{
            x: 0,
            y: 0,
            width: 100,
            height: 100,
          }}
        />
      </div>
    </div>
  );
}

type Vector2 = [number, number];
type Transform = [[number, number, number], [number, number, number]];
type Rectangle = { x: number; y: number; width: number; height: number };

/**
 * Apply the 2×3 transform matrix to a 2D point.
 */
function transformPoint(M: Transform, [x, y]: Vector2): Vector2 {
  return [
    M[0][0] * x + M[0][1] * y + M[0][2],
    M[1][0] * x + M[1][1] * y + M[1][2],
  ];
}

/**
 * A simple <div>-based line connecting two points (absolute-positioned in the parent).
 */
function Line({ a, b }: { a: Vector2; b: Vector2 }) {
  // Distance and angle
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.sqrt(dx * dx + dy * dy);
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

  return (
    <div
      style={{
        position: "absolute",
        left: a[0],
        top: a[1],
        width: length,
        height: 2,
        background: "skyblue",
        transformOrigin: "0 50%",
        transform: `rotate(${angleDeg}deg)`,
        pointerEvents: "none",
      }}
    />
  );
}

/**
 * Example: Renders a line from the gradient's start → end in local space, using only HTML <div>.
 *
 * In Figma-like gradient space:
 *   [0, 0] -> gradient start
 *   [1, 0] -> gradient end
 *
 * The `transform` maps that line into the node’s local coords.
 * You could further nest this within a parent that has nodeTransform if you want
 * to combine node + gradient transforms.
 */
function GradientLine({
  rect,
  transform,
}: {
  rect: Rectangle;
  transform: Transform;
}) {
  // We'll ignore rect here if we just want a basic [0,0]→[1,0] line.
  // For advanced usage, you might consider rect dimensions in the transform.

  const p1 = transformPoint(
    transform,
    // start
    [rect.x, rect.y]
  );
  const p2 = transformPoint(
    transform,
    // end
    [rect.x + rect.width, rect.y + rect.height]
  );

  return (
    <>
      {/* Draw a line from p1 to p2 */}
      <Line a={p1} b={p2} />

      {/* Optional: endpoints as "Point" divs, referencing your SurfacePathEditor approach */}
      <Point point={p1} color="red" />
      <Point point={p2} color="blue" />
    </>
  );
}

/**
 * Similar to the VertexPoint in SurfacePathEditor — just a small dot in HTML.
 */
function Point({ point, color }: { point: Vector2; color?: string }) {
  return (
    <div
      style={{
        position: "absolute",
        left: point[0],
        top: point[1],
        transform: "translate(-50%, -50%)",
        width: 8,
        height: 8,
        borderRadius: "50%",
        backgroundColor: color || "#111",
        border: "1px solid #fff",
        pointerEvents: "none",
      }}
    />
  );
}
