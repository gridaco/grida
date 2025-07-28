import cmath from "@grida/cmath";
import { SVGCommand, encodeSVGPath, SVGPathData } from "svg-pathdata";

type Vector2 = [number, number];
export namespace vn {
  /**
   * Represents a vertex in the vector network.
   */
  export type VectorNetworkVertex = { p: Vector2 };

  /**
   * Represents a segment in the vector network, connecting two vertices.
   *
   * @property a - Index of the starting vertex.
   * @property b - Index of the ending vertex.
   * @property ta - Tangent at the starting vertex (relative to the vertex).
   * @property tb - Tangent at the ending vertex (relative to the vertex).
   */
  export type VectorNetworkSegment = {
    a: number;
    b: number;
    ta: Vector2;
    tb: Vector2;
  };

  /**
   * Represents the vector network, consisting of vertices and segments.
   *
   * @example
   * ```ts
   * const example: VectorNetwork = {
   *   vertices: [
   *     { x: 10, y: 10 }, // Index 0: Starting point
   *     { x: 50, y: 10 }  // Index 1: End point
   *   ],
   *   segments: [
   *     {
   *       a: 0, // Start at vertices[0] (10, 10)
   *       b: 1, // End at vertices[1] (50, 10)
   *       ta: { x: 10, y: 10 }, // Tangent relative to start (absolute: 20, 20)
   *       tb: { x: -10, y: 10 } // Tangent relative to end (absolute: 40, 20)
   *     }
   *   ]
   * };
   * ```
   * This example corresponds to the SVG path:
   * `M 10 10 C 20 20, 40 20, 50 10`
   *
   * ----
   *
   * ## Guidelines for Manipulating a Vector Network
   *
   * A vector network represents a graph-like structure of vertices and segments.
   * Proper manipulation ensures correct rendering and functionality.
   *
   * ## Requirements
   *
   * 1. **Order of Vertices and Segments**:
   *    - **Sequential Paths**: The order of vertices and segments must be respected for rendering strokes or paths.
   *      - Example: Open or closed paths where the visual flow depends on the sequence.
   *    - **Graph-Like Structures**: Order does not matter if the network is used as a graph with arbitrary connections.
   *
   * 2. **Region Construction**:
   *    - Loops in regions (`VectorRegion.loops`) must maintain a consistent order.
   *    - Ensure correct winding rules (clockwise or counterclockwise) for proper fill rendering.
   *
   * 3. **Adding/Removing Vertices or Segments**:
   *    - After adding or removing elements, normalize the data:
   *      - Update any dependent structures, such as `VectorRegion.loops`.
   *      - Ensure indices in segments (`a`, `b`) remain valid.
   *
   * 4. **Consistency in Indices**:
   *    - Segments (`a`, `b`) must reference valid indices in the `vertices` array.
   *    - Avoid leaving unused or orphaned vertices.
   *
   * 5. **Control Points (Tangents)**:
   *    - Ensure that control points (`ta`, `tb`) are relative to their respective vertices.
   *    - Invalid or mismatched control points can lead to incorrect Bézier curve rendering.
   *
   * 6. **Validation After Manipulation**:
   *    - Check for disconnected segments or invalid references to vertices.
   *    - Ensure all closed regions are properly defined, with no overlapping or missing paths.
   *
   * 7. **Rendering Context**:
   *    - Understand the context of the vector network:
   *      - Sequential paths (order matters).
   *      - Arbitrary connections (order may not matter).
   *
   * ## Best Practices
   *
   * - Always maintain a consistent order for paths or regions.
   * - Normalize the vector network data after edits to avoid rendering issues.
   * - Use explicit indexing (`a`, `b`) to define segment connections instead of relying on order alone.
   * - Validate data integrity before rendering or exporting to formats like SVG.
   */
  export interface VectorNetwork {
    vertices: VectorNetworkVertex[];
    segments: VectorNetworkSegment[];
  }

  /**
   * creates a vector network from a polyline points
   * @param points points in the polyline
   * @returns
   */
  export function polyline(points: Vector2[]): VectorNetwork {
    // TODO: this does not validate the duplicate points
    const vertices = points.map((p) => ({ p }));
    const segments = vertices.slice(0, -1).map((_, i) => ({
      a: i,
      b: i + 1,
      ta: cmath.vector2.zero,
      tb: cmath.vector2.zero,
    }));
    return { vertices, segments };
  }

  export class VectorNetworkEditor {
    private _vertices: VectorNetworkVertex[] = [];
    private _segments: VectorNetworkSegment[] = [];

    constructor(value?: VectorNetwork) {
      if (value) {
        this._vertices = value.vertices;
        this._segments = value.segments;
      }
    }

    get vertices(): VectorNetworkVertex[] {
      return this._vertices;
    }

    get segments(): VectorNetworkSegment[] {
      return this._segments;
    }

    get value(): VectorNetwork {
      return { vertices: this._vertices, segments: this._segments };
    }

    findVertex(p: Vector2): number | null {
      for (let i = 0; i < this._vertices.length; i++) {
        if (
          this._vertices[i].p[0] === p[0] &&
          this._vertices[i].p[1] === p[1]
        ) {
          return i;
        }
      }
      return null;
    }

    /**
     * finds the segment that contains the given vertex index
     * @param v
     * @returns
     */
    findSegments(v: number, point: "a" | "b" | "any" = "any"): number[] {
      const result: number[] = [];
      for (let j = 0; j < this._segments.length; j++) {
        if (point === "any") {
          if (this._segments[j].a === v || this._segments[j].b === v) {
            result.push(j);
          }
        } else if (point === "a" && this._segments[j].a === v) {
          result.push(j);
        } else if (point === "b" && this._segments[j].b === v) {
          result.push(j);
        }
      }
      return result;
    }

    /**
     * adds a vertex to the network (optionally connecting it to the selected vertex)
     * @param p the position of the new vertex
     * @param origin the index of the vertex to connect the new vertex to
     * @param ta if origin is provided, and the new segment is to be created, this is the `ta` value of the new segment. - use {@link getNextMirroredTangent} to get the mirrored value of the previous segment's tb
     * @param tb if origin is provided, and the new segment is to be created, this is the `tb` value of the new segment.
     * @returns the index of the added vertex
     */
    addVertex(
      p: Vector2,
      origin?: number | null,
      ta: Vector2 = [0, 0],
      tb: Vector2 = [0, 0]
    ): number {
      // check if new point already exists
      let vertex_idx: number;
      const existing = this.findVertex(p);
      if (existing === null) {
        vertex_idx = this._vertices.push({ p }) - 1;
      } else {
        vertex_idx = existing;
      }

      if (typeof origin === "number") {
        this.addSegment(origin, vertex_idx, ta, tb);
      }
      return vertex_idx;
    }

    /**
     * virtually, if the `origin` were to be connected to another vertex, it returns the new segment's ta value, based on previous segment's tb value, inverted
     * @param origin
     */
    getNextMirroredTangent(origin: number): Vector2 {
      let mirrored: Vector2 = [0, 0];
      const selection_segments = this.findSegments(origin);
      if (selection_segments.length === 1) {
        // one segment means the force is open.
        // use the origin -tb as the new ta
        const prev_tb = this._segments[selection_segments[0]].tb;
        mirrored = [-prev_tb[0], -prev_tb[1]];
      }
      return mirrored;
    }

    /**
     * deletes the vertex at the given index.
     * associated segments are also deleted and re-assigned.
     * @param i
     *
     * @example
     * ```
     * => vertices: [ A, B, C, D ]
     * => segments: [ AB, BC, CD ]
     * => deleteVertex(B)
     * => vertices: [ A, C, D ]
     * => segments: [ AC, CD ]
     * ```
     */
    deleteVertex(i: number) {
      if (i < 0 || i >= this._vertices.length) {
        throw new Error(`Invalid vertex index: ${i}`);
      }

      // Remove the vertex at index `i`
      this._vertices.splice(i, 1);

      // Remove segments associated with the vertex
      this._segments = this._segments.filter(
        (segment) => segment.a !== i && segment.b !== i
      );

      // Adjust remaining segment indices to reflect the deleted vertex
      this._segments = this._segments.map((segment) => ({
        a: segment.a > i ? segment.a - 1 : segment.a,
        b: segment.b > i ? segment.b - 1 : segment.b,
        ta: segment.ta,
        tb: segment.tb,
      }));
    }

    moveVertex(i: number, p: Vector2) {
      if (i < 0 || i >= this._vertices.length) {
        throw new Error(`Invalid vertex index: ${i}`);
      }
      this._vertices[i].p = p;
    }

    translateVertex(i: number, delta: Vector2) {
      if (i < 0 || i >= this._vertices.length) {
        throw new Error(`Invalid vertex index: ${i}`);
      }
      const p = this._vertices[i].p;
      this._vertices[i].p = [p[0] + delta[0], p[1] + delta[1]];
    }

    translate(delta: Vector2) {
      this._vertices = this._vertices.map((v) => ({
        p: [v.p[0] + delta[0], v.p[1] + delta[1]],
      }));
    }

    scale(factor: Vector2) {
      this._vertices = this._vertices.map((v) => ({
        p: cmath.vector2.multiply(v.p, factor),
      }));
      this._segments = this._segments.map((s) => ({
        a: s.a,
        b: s.b,
        ta: cmath.vector2.multiply(s.ta, factor),
        tb: cmath.vector2.multiply(s.tb, factor),
      }));
    }

    addSegment(
      a: number,
      b: number,
      ta: Vector2 = cmath.vector2.zero,
      tb: Vector2 = cmath.vector2.zero
    ) {
      // TODO: check for duplicate segments and ignore.

      this._segments.push({
        a,
        b,
        ta,
        tb,
      });
    }

    /**
     *
     * @param segment the index of the segment to update
     * @param control the control point to update (ta or tb)
     * @param value the new tangent value
     * @param reflection if true, it will also update the previous (tb if ta) / next (ta if tb) segment's tangent (if available)
     *
     */
    updateTangent(
      segmentIndex: number,
      control: "ta" | "tb",
      value: Vector2,
      reflection: boolean
    ) {
      // 1. update the primary tangent
      this._segments[segmentIndex][control] = value;

      // 2. optional reflection
      if (!reflection) return;

      const seg = this._segments[segmentIndex];
      const vertexIndex = control === "ta" ? seg.a : seg.b;

      // find connected segment sharing this vertex
      const connected = this._segments
        .map((s, i) => ({ s, i }))
        .filter(
          ({ s, i }) =>
            i !== segmentIndex && (s.a === vertexIndex || s.b === vertexIndex)
        );

      // reflect if there's exactly one connecting segment
      if (connected.length === 1) {
        const { s, i } = connected[0];
        const otherControl = s.a === vertexIndex ? "ta" : "tb";
        // invert
        this._segments[i][otherControl] = [-value[0], -value[1]];
      }
    }

    getBBox(): cmath.Rectangle {
      return getBBox(this.value);
    }

    /**
     * Use with Pencil tool
     *
     * extends the polyline by adding a new vertex at the end
     * - assumes the the verteces are in order
     * @param p
     */
    extendPolyline(p: Vector2) {
      // TODO: this does not validate the duplicate points
      const pl = polyline([...this._vertices.map((v) => v.p), p]);
      this._vertices = pl.vertices;
      this._segments = pl.segments;
    }

    /**
     * Use with Line tool
     * extends the line by moving the last vertex to the new position
     * - assumes the the verteces are in order
     * - assumes there are exactly 1 or 2 vertices
     * @param p
     */
    extendLine(p: Vector2) {
      // TODO: this does not validate the duplicate points
      const a = this._vertices[0];
      const b = p;
      this._vertices = [a, { p: b }];
      this._segments = [{ a: 0, b: 1, ta: [0, 0], tb: [0, 0] }];
    }
  }

  /**
   * Returns an approximate bounding box for the entire vector network
   * by collecting vertices and their tangent (control) points.
   */
  export function getBBoxApprox(vn: VectorNetwork): cmath.Rectangle {
    const pts: Vector2[] = [];

    // 1. collect all vertex positions
    for (const v of vn.vertices) {
      pts.push(v.p);
    }

    // 2. collect tangent endpoints (a + ta, b + tb)
    for (const seg of vn.segments) {
      const a = vn.vertices[seg.a].p;
      const b = vn.vertices[seg.b].p;
      pts.push([a[0] + seg.ta[0], a[1] + seg.ta[1]]);
      pts.push([b[0] + seg.tb[0], b[1] + seg.tb[1]]);
    }

    // 3. compute bounding box from all points
    return cmath.rect.fromPoints(pts);
  }

  /**
   * Exact bounding box of a vector network by summing each segment's cubic bounding box.
   **/
  export function getBBox(vn: vn.VectorNetwork) {
    if (vn.vertices.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    let box = { x: Infinity, y: Infinity, width: 0, height: 0 };
    for (const seg of vn.segments) {
      const { a: _a, b: _b, ta, tb } = seg;
      const a = vn.vertices[_a].p;
      const b = vn.vertices[_b].p;
      const sb = cmath.bezier.getBBox({ a, b, ta, tb });
      if (box.x === Infinity) {
        box = sb;
      } else {
        box = cmath.rect.union([box, sb]);
      }
    }

    return box;
  }

  /**
   * Converts a vector network to SVG path data.
   *
   * @param vn - Vector network to convert.
   * @returns The SVG path data string representing the vector network.
   */
  export function toSVGPathData(vn: vn.VectorNetwork) {
    const { vertices, segments } = vn;

    // Prepare path commands
    const commands: SVGCommand[] = [];

    // Keep track of visited segments to avoid duplicates
    const visitedSegments = new Set();

    if (vertices.length === 0) {
      return "";
    }

    // Move to the first vertex
    commands.push({
      type: SVGPathData.MOVE_TO,
      x: vertices[0].p[0],
      y: vertices[0].p[1],
      relative: false,
    });

    segments.forEach((segment, i) => {
      const { a, b, ta, tb } = segment;

      // Skip if the segment is already visited
      if (
        visitedSegments.has(`${a}-${b}`) ||
        visitedSegments.has(`${b}-${a}`)
      ) {
        return;
      }

      visitedSegments.add(`${a}-${b}`);

      // if this segment is not sequential (using a new starting point), move to the starting point
      const prev_b = segments[i - 1]?.b ?? 0;
      if (prev_b !== a) {
        commands.push(
          {
            type: SVGPathData.MOVE_TO,
            x: vertices[a].p[0],
            y: vertices[a].p[1],
            relative: false,
          } // Move to
        );
      }

      // if ta and tb are 0, use line.
      if (ta[0] === 0 && ta[1] === 0 && tb[0] === 0 && tb[1] === 0) {
        commands.push(
          {
            type: SVGPathData.LINE_TO,
            x: vertices[b].p[0],
            y: vertices[b].p[1],
            relative: false,
          } // Line to
        );
        return;
      }

      const start = vertices[a].p;
      const end = vertices[b].p;
      const control1 = [start[0] + ta[0], start[1] + ta[1]];
      const control2 = [end[0] + tb[0], end[1] + tb[1]];

      commands.push(
        {
          type: SVGPathData.CURVE_TO,
          x1: control1[0],
          y1: control1[1],
          x2: control2[0],
          y2: control2[1],
          x: end[0],
          y: end[1],
          relative: false,
        } // Cubic Bezier curve
      );
    });

    // Encode the path commands to SVG path data
    return encodeSVGPath(commands);

    //
  }

  export function fromSVGPathData(d: string): vn.VectorNetwork {
    const parsedPath = new SVGPathData(d).toAbs(); // Convert to absolute commands
    const commands = parsedPath.commands;

    const vne = new vn.VectorNetworkEditor();

    let lastPoint: [number, number] | null = null;
    // start index of the current path (when closed, this is set to current + 1)
    let start = 0;

    for (const command of commands) {
      const { type } = command;

      switch (type) {
        // M x y
        case SVGPathData.MOVE_TO: {
          const { x, y } = command;
          vne.addVertex([x, y]);
          lastPoint = [x, y];
          break;
        }

        // L x y
        case SVGPathData.LINE_TO: {
          const { x, y } = command;
          if (lastPoint) {
            const origin = vne.vertices.length - 1;
            vne.addVertex([x, y], origin);
          }
          lastPoint = [x, y];
          break;
        }

        case SVGPathData.HORIZ_LINE_TO: {
          const { x } = command;
          if (lastPoint) {
            const origin = vne.vertices.length - 1;
            vne.addVertex([x, lastPoint[1]], origin);
          }

          // Update lastPoint to the new position
          lastPoint = [x, lastPoint ? lastPoint[1] : 0];
          break;
        }

        case SVGPathData.VERT_LINE_TO: {
          const { y } = command;
          if (lastPoint) {
            const origin = vne.vertices.length - 1;
            vne.addVertex([lastPoint[0], y], origin);
          }
          lastPoint = [lastPoint ? lastPoint[0] : 0, y]; // Update lastPoint to the new position
          break;
        }

        // C x1 y1, x2 y2, x y
        case SVGPathData.CURVE_TO: {
          const { x, y } = command;
          if (lastPoint) {
            const origin = vne.vertices.length - 1;

            const ta: cmath.Vector2 = [
              command.x1 - lastPoint[0],
              command.y1 - lastPoint[1],
            ];
            const tb: cmath.Vector2 = [command.x2 - x, command.y2 - y];

            vne.addVertex([x, y], origin, ta, tb);
          }
          lastPoint = [x, y];
          break;
        }

        case SVGPathData.SMOOTH_CURVE_TO: {
          const { x, y, x2, y2 } = command;

          if (lastPoint) {
            const origin = vne.vertices.length - 1;

            const ta = vne.getNextMirroredTangent(origin);
            const tb: cmath.Vector2 = [x2 - x, y2 - y];
            vne.addVertex([x, y], origin, ta, tb);
          }

          lastPoint = [x, y];
          break;
        }
        case SVGPathData.QUAD_TO: {
          throw new Error("QUAD_TO is not supported");
          break;
          //
        }
        case SVGPathData.SMOOTH_QUAD_TO: {
          throw new Error("SMOOTH_QUAD_TO is not supported");
          break;
          //
        }
        case SVGPathData.ARC: {
          const { rX, rY, xRot, lArcFlag, sweepFlag, x, y } = command;

          if (lastPoint) {
            const [x1, y1] = lastPoint;

            // Convert arc to cubic Bézier curves
            const bezierCurves = cmath.bezier.a2c(
              x1,
              y1,
              rX,
              rY,
              xRot,
              lArcFlag,
              sweepFlag,
              x,
              y
            );

            let previousIndex = vne.vertices.length - 1;

            for (let i = 0; i < bezierCurves.length; i += 6) {
              const [x1, y1, x2, y2, x3, y3] = bezierCurves.slice(i, i + 6);

              const controlPoint1: Vector2 = [x1, y1];
              const controlPoint2: Vector2 = [x2, y2];
              const endPoint: Vector2 = [x3, y3];

              // Add the end point as a new vertex
              const endIndex = vne.addVertex(endPoint);

              // Add a new segment with control points
              vne.addSegment(
                previousIndex,
                endIndex,
                [
                  controlPoint1[0] - lastPoint[0],
                  controlPoint1[1] - lastPoint[1],
                ], // ta (relative to start)
                [controlPoint2[0] - endPoint[0], controlPoint2[1] - endPoint[1]] // tb (relative to end)
              );

              // Update lastPoint and previousIndex for the next curve
              lastPoint = endPoint;
              previousIndex = endIndex;
            }
          }
          break;
        }

        // Z
        case SVGPathData.CLOSE_PATH: {
          if (vne.vertices.length > 1) {
            const current = vne.vertices.length - 1;
            vne.addSegment(current, start);

            // reset the start point (to the next point - which is not present yet)
            start = current + 1;
          }
          break;
        }

        default:
          throw new Error(`Unsupported path command type: ${type}`);
      }
    }

    return vne.value;
  }

  export function fromRect(shape: cmath.Rectangle): vn.VectorNetwork {
    const { x, y, width, height } = shape;

    // Create 4 vertices for the rectangle corners
    const vertices: vn.VectorNetworkVertex[] = [
      { p: [x, y] }, // Top-left
      { p: [x + width, y] }, // Top-right
      { p: [x + width, y + height] }, // Bottom-right
      { p: [x, y + height] }, // Bottom-left
    ];

    // Create 4 segments connecting the vertices in order
    const segments: vn.VectorNetworkSegment[] = [
      { a: 0, b: 1, ta: [0, 0], tb: [0, 0] }, // Top edge
      { a: 1, b: 2, ta: [0, 0], tb: [0, 0] }, // Right edge
      { a: 2, b: 3, ta: [0, 0], tb: [0, 0] }, // Bottom edge
      { a: 3, b: 0, ta: [0, 0], tb: [0, 0] }, // Left edge (closes the rectangle)
    ];

    return { vertices, segments };
  }

  // export function fromEllipse(shape: cmath.Rectangle) {}
  // export function fromLine(shape) {}

  export function fromRegularPolygon(
    shape: cmath.Rectangle & {
      points: number;
    }
  ): vn.VectorNetwork {
    const { width, height, points } = shape;
    const cx = width / 2;
    const cy = height / 2;
    const rx = (width / 2) * 0.9;
    const ry = (height / 2) * 0.9;
    const step = (Math.PI * 2) / points;
    const pts: Vector2[] = Array.from({ length: points }, (_, i) => {
      const angle = i * step - Math.PI / 2;
      const x = cx + rx * Math.cos(angle);
      const y = cy + ry * Math.sin(angle);
      return [x, y];
    });

    return polyline(pts);
  }

  export function fromRegularStarPolygon(
    shape: cmath.Rectangle & {
      points: number;
      innerRadius: number;
    }
  ): vn.VectorNetwork {
    const { width, height, points, innerRadius } = shape;
    const cx = width / 2;
    const cy = height / 2;
    const outerRx = (width / 2) * 0.9;
    const outerRy = (height / 2) * 0.9;
    const innerRx = outerRx * innerRadius;
    const innerRy = outerRy * innerRadius;
    const step = Math.PI / points;
    const pts: Vector2[] = [];
    for (let i = 0; i < points * 2; i++) {
      const angle = i * step - Math.PI / 2;
      const rx = i % 2 === 0 ? outerRx : innerRx;
      const ry = i % 2 === 0 ? outerRy : innerRy;
      const x = cx + rx * Math.cos(angle);
      const y = cy + ry * Math.sin(angle);
      pts.push([x, y]);
    }

    return polyline(pts);
  }
}
