import { cmath } from "@/grida-canvas/cmath";

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
    private vertices: VectorNetworkVertex[] = [];
    private segments: VectorNetworkSegment[] = [];

    get value(): VectorNetwork {
      return { vertices: this.vertices, segments: this.segments };
    }

    constructor(value?: VectorNetwork) {
      if (value) {
        this.vertices = Array.from(value.vertices);
        this.segments = Array.from(value.segments);
      }
    }

    findVertex(p: Vector2): number | null {
      for (let i = 0; i < this.vertices.length; i++) {
        if (this.vertices[i].p[0] === p[0] && this.vertices[i].p[1] === p[1]) {
          return i;
        }
      }
      return null;
    }

    /**
     * finds the segment that contains the given vertex index
     * @param i
     * @returns
     */
    findSegments(i: number): number[] {
      const result: number[] = [];
      for (let j = 0; j < this.segments.length; j++) {
        if (this.segments[j].a === i || this.segments[j].b === i) {
          result.push(j);
        }
      }
      return result;
    }

    /**
     * adds a vertex to the network (optionally connecting it to the selected vertex)
     * @param p the position of the new vertex
     * @param origin the index of the vertex to connect the new vertex to
     * @param reflection if true, the tangent of the new segment will be the inverse of the tangent of the previous segment (if the previous segment exists)
     * @returns the index of the added vertex
     */
    addVertex(
      p: Vector2,
      origin?: number | null,
      reflection?: boolean
    ): number {
      // check if new point already exists
      let vertex_idx: number;
      const existing = this.findVertex(p);
      if (existing === null) {
        vertex_idx = this.vertices.push({ p }) - 1;
      } else {
        vertex_idx = existing;
      }

      if (typeof origin === "number") {
        // connect the new point to the selected point

        let ta: Vector2 | undefined;

        if (reflection) {
          const selection_segments = this.findSegments(origin);
          if (selection_segments.length === 1) {
            // one segment means the force is open.
            // use the origin -tb as the new ta
            const prev_tb = this.segments[selection_segments[0]].tb;
            ta = [-prev_tb[0], -prev_tb[1]];
          }
        }

        this.addSegment(origin, vertex_idx, ta ?? [0, 0], [0, 0]);
      }
      return vertex_idx;
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
      if (i < 0 || i >= this.vertices.length) {
        throw new Error(`Invalid vertex index: ${i}`);
      }

      // Remove the vertex at index `i`
      this.vertices.splice(i, 1);

      // Remove segments associated with the vertex
      this.segments = this.segments.filter(
        (segment) => segment.a !== i && segment.b !== i
      );

      // Adjust remaining segment indices to reflect the deleted vertex
      this.segments = this.segments.map((segment) => ({
        a: segment.a > i ? segment.a - 1 : segment.a,
        b: segment.b > i ? segment.b - 1 : segment.b,
        ta: segment.ta,
        tb: segment.tb,
      }));
    }

    moveVertex(i: number, p: Vector2) {
      if (i < 0 || i >= this.vertices.length) {
        throw new Error(`Invalid vertex index: ${i}`);
      }
      this.vertices[i].p = p;
    }

    translateVertex(i: number, delta: Vector2) {
      if (i < 0 || i >= this.vertices.length) {
        throw new Error(`Invalid vertex index: ${i}`);
      }
      const p = this.vertices[i].p;
      this.vertices[i].p = [p[0] + delta[0], p[1] + delta[1]];
    }

    translate(delta: Vector2) {
      this.vertices = this.vertices.map((v) => ({
        p: [v.p[0] + delta[0], v.p[1] + delta[1]],
      }));
    }

    addSegment(a: number, b: number, ta: Vector2, tb: Vector2) {
      // TODO: check for duplicate segments and ignore.

      this.segments.push({
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
      this.segments[segmentIndex][control] = value;

      // 2. optional reflection
      if (!reflection) return;

      const seg = this.segments[segmentIndex];
      const vertexIndex = control === "ta" ? seg.a : seg.b;

      // find connected segment sharing this vertex
      const connected = this.segments
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
        this.segments[i][otherControl] = [-value[0], -value[1]];
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
      const pl = polyline([...this.vertices.map((v) => v.p), p]);
      this.vertices = pl.vertices;
      this.segments = pl.segments;
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
      const a = this.vertices[0];
      const b = p;
      this.vertices = [a, { p: b }];
      this.segments = [{ a: 0, b: 1, ta: [0, 0], tb: [0, 0] }];
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
}
