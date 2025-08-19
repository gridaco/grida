import { svg } from "@/grida-canvas-utils/svg";
import cmath from "@grida/cmath";

export function Curve({
  a,
  b,
  ta = [0, 0],
  tb = [0, 0],
  className,
  strokeWidth = 2,
  stroke,
  style,
  ...props
}: React.HtmlHTMLAttributes<HTMLOrSVGElement> & {
  a: cmath.Vector2;
  b: cmath.Vector2;
  ta?: cmath.Vector2;
  tb?: cmath.Vector2;
  className?: string;
  strokeWidth?: number;
  stroke?: string;
}) {
  //
  const offset = a;
  const _a = cmath.vector2.sub(a, offset);
  const _b = cmath.vector2.sub(b, offset);
  const path = svg.d.encode(svg.d.curve(_a, ta, tb, _b));

  return (
    <svg
      {...props}
      id="curve"
      className={className}
      style={{
        position: "absolute",
        width: 1,
        height: 1,
        left: offset[0],
        top: offset[1],
        overflow: "visible",
        ...style,
      }}
    >
      <path d={path} stroke={stroke} fill="none" strokeWidth={strokeWidth} />
    </svg>
  );
}
