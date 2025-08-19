import cmath from "@grida/cmath";
import { SVGCommand, encodeSVGPath, SVGPathData } from "svg-pathdata";

type Vector2 = cmath.Vector2;
export namespace vn {
  /**
   * Represents a loop as an array of segment indices.
   */
  export type Loop = number[];
  /**
   * Represents a vertex in the vector network.
   */
  export type VectorNetworkVertex = Vector2;

  /**
   * Represents a point on a specific segment of the vector network.
   *
   * This type provides a minimal representation of a location on a curve segment,
   * using parametric coordinates that can be evaluated to get the actual position
   * on the Bézier curve.
   *
   * @example
   * ```ts
   * const pointOnSegment: PointOnSegment = {
   *   segment: 0,  // Index of the segment in the vector network
   *   t: 0.5       // Parametric value: 0 = start, 1 = end, 0.5 = middle
   * };
   *
   * // Evaluate to get the actual position
   * const position = cmath.bezier.evaluate(
   *   vertices[segments[0].a],
   *   vertices[segments[0].b],
   *   segments[0].ta,
   *   segments[0].tb,
   *   pointOnSegment.t
   * );
   * ```
   *
   * @see {@link cmath.bezier.evaluate} - For evaluating the point to get its position
   * @see {@link cmath.bezier.project} - For projecting a point onto a segment
   */
  export type PointOnSegment = {
    /**
     * Index of the segment in the vector network's segments array.
     *
     * This references a specific segment within the vector network,
     * allowing the point to be located on a particular curve.
     *
     * @example
     * ```ts
     * const segment = vectorNetwork.segments[pointOnSegment.segment];
     * ```
     */
    segment: number;

    /**
     * Parametric value along the segment, ranging from 0 to 1.
     *
     * - `0` represents the start of the segment (vertex `a`)
     * - `1` represents the end of the segment (vertex `b`)
     * - `0.5` represents the middle of the segment
     * - Values outside [0, 1] are valid but represent points beyond the segment
     *
     * This value is used with Bézier curve evaluation functions to determine
     * the exact position on the curve.
     *
     * @example
     * ```ts
     * // Get the position at 25% along the segment
     * const position = cmath.bezier.evaluate(
     *   vertices[segment.a],
     *   vertices[segment.b],
     *   segment.ta,
     *   segment.tb,
     *   0.25
     * );
     * ```
     */
    t: number;
  };

  /**
   * Represents a point on a segment with its evaluated position.
   *
   * This type extends `PointOnSegment` to include the computed position
   * on the curve, eliminating the need to re-evaluate the curve when
   * the point is needed for measurements or display.
   *
   * @example
   * ```ts
   * const evaluatedPoint: EvaluatedPointOnSegment = {
   *   segment: 0,  // Index of the segment
   *   t: 0.5,      // Parametric value (middle of segment)
   *   point: [10, 20]  // Evaluated position in local coordinates
   * };
   * ```
   */
  export type EvaluatedPointOnSegment = PointOnSegment & {
    /**
     * Resolved point on the curve in local coordinates (relative to vector network origin).
     *
     * This is the actual position on the curve at the parametric value `t`.
     * Storing this eliminates the need to re-evaluate the curve when the point
     * is needed for measurements or display.
     *
     * @example
     * ```ts
     * // Use the pre-computed position directly
     * const position = evaluatedPoint.point;
     * ```
     */
    point: Vector2;
  };

  export type AbsoluteTangentControlOnSegment = {
    segment: number;
    control: "ta" | "tb";
    point: Vector2;
  };

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
   * tangent mirroring mode
   *
   * **description based on moving ta (applies the same vice versa for tb)**
   * - `none` - no mirroring
   *   - moving ta will not affect tb at all.
   * - `angle` - mirror the angle of the tangent, but keep the length
   *   - moving ta will affect tb, but only the **exact (inverted)** angle will be mirrored.
   * - `all` - mirror the angle and length of the tangent
   *   - moving ta will affect tb, and mirror the **exact (inverted)** value of ta, not by the delta of angle/length.
   * - `auto` - automatically decide whether to mirror based on the current
   *   relationship of the tangents. If they are already mirrored, behaves like
   *   `all`, if only the angle is mirrored behaves like `angle`, otherwise acts as `none`.
   */
  export type StrictTangentMirroringMode = "none" | "angle" | "all";
  export type TangentMirroringMode = StrictTangentMirroringMode | "auto";

  /**
   * Configuration options for segment splitting operations.
   */
  export interface SplitSegmentConfig {
    /**
     * Whether to preserve zero tangents when possible.
     *
     * When `true`, if the original segment has zero tangents, the split segments
     * will also have zero tangents, avoiding the introduction of unnecessary
     * tangent controls that might confuse users.
     *
     * When `false`, the mathematically accurate de Casteljau's algorithm is used,
     * which may introduce non-zero tangents even for originally straight segments.
     *
     * @defaultValue true
     */
    preserveZero?: boolean;
  }

  /**
   * infer the mirroring mode from two tangents
   *
   * @param ta tangent a
   * @param tb tangent b
   *
   * @remarks
   * When either tangent is the zero vector, there is no meaningful direction
   * or length to mirror, so this returns `"none"`.
   */
  export function inferMirroringMode(
    ta: Vector2,
    tb: Vector2
  ): StrictTangentMirroringMode {
    if (cmath.vector2.isZero(ta) || cmath.vector2.isZero(tb)) {
      return "none";
    }
    const [ax, ay] = ta;
    const [bx, by] = tb;
    const la = Math.hypot(ax, ay);
    const lb = Math.hypot(bx, by);
    // cross product for 2D vectors
    const cross = ax * by - ay * bx;
    const crossNorm = cross / (la * lb);
    const ANGLE_EPSILON = 1e-3;
    if (Math.abs(crossNorm) > ANGLE_EPSILON) return "none";
    // dot product to determine direction
    const dot = ax * bx + ay * by;
    if (dot >= 0) return "none";
    return Math.abs(la - lb) < Number.EPSILON ? "all" : "angle";
  }

  export interface OptimizationConfig {
    /**
     * Maximum distance between two vertices for them to be considered identical.
     *
     * @defaultValue 0
     */
    vertex_tolerance: number;

    /**
     * Remove vertices that are not referenced by any segment.
     *
     * @defaultValue true
     */
    remove_unused_verticies: boolean;
  }

  /**
   * creates a vector network from a polyline points
   * @param points points in the polyline
   * @returns
   */
  export function polyline(points: Vector2[]): VectorNetwork {
    // TODO: this does not validate the duplicate points
    const vertices = points.map((p) => p);
    const segments = vertices.slice(0, -1).map((_, i) => ({
      a: i,
      b: i + 1,
      ta: cmath.vector2.zero,
      tb: cmath.vector2.zero,
    }));
    return { vertices, segments };
  }

  /**
   * creates a closed polygon vector network from given points
   */
  export function polygon(points: Vector2[]): VectorNetwork {
    const vn = polyline(points);
    if (vn.vertices.length > 1) {
      const last = vn.vertices.length - 1;
      vn.segments.push({
        a: last,
        b: 0,
        ta: cmath.vector2.zero,
        tb: cmath.vector2.zero,
      });
    }
    return vn;
  }

  export class VectorNetworkEditor {
    /**
     * Optimizes a {@link VectorNetwork} by removing duplicate vertices and
     * segments, optionally removing unused vertices.
     *
     * Also known as *simplify* or *deduplicate*, this method normalizes the
     * network by merging vertices that share the same coordinates and by
     * collapsing segments with identical endpoints and tangents. The input
     * network is not mutated; a new, optimized network is returned instead.
     *
     * ## Deduplication Criteria
     *
     * - **Vertices**: Two vertices are considered duplicates if they have identical coordinates.
     * - **Segments**: Two segments are considered duplicates if they have:
     *   - Identical endpoint indices (after vertex deduplication and index remapping)
     *   - Identical tangent control points (`ta` and `tb` values)
     *
     * Segment orientation is preserved - a segment `a -> b` is considered different from `b -> a`.
     * The deduplication process first remaps segment indices to account for merged vertices, then
     * removes segments with identical geometry.
     *
     * @param net - The network to optimize.
     * @param config - Optimization options.
     * @returns A new {@link VectorNetwork} without duplicate or unused
     *          vertices and segments.
     */
    static optimize(
      net: VectorNetwork,
      config: OptimizationConfig = {
        vertex_tolerance: 0,
        remove_unused_verticies: true,
      }
    ): VectorNetwork {
      const { vertex_tolerance, remove_unused_verticies } = config;
      const vertices: VectorNetworkVertex[] = [];
      const indexMap = new Map<number, number>();

      for (let i = 0; i < net.vertices.length; i++) {
        const p = net.vertices[i];
        let existing = vertices.findIndex(
          (v) =>
            Math.abs(v[0] - p[0]) <= vertex_tolerance &&
            Math.abs(v[1] - p[1]) <= vertex_tolerance
        );
        if (existing === -1) {
          existing = vertices.length;
          vertices.push([p[0], p[1]] as Vector2);
        }
        indexMap.set(i, existing);
      }

      const segments: VectorNetworkSegment[] = [];
      for (const seg of net.segments) {
        segments.push({
          a: indexMap.get(seg.a)!,
          b: indexMap.get(seg.b)!,
          ta: [seg.ta[0], seg.ta[1]] as Vector2,
          tb: [seg.tb[0], seg.tb[1]] as Vector2,
        });
      }

      const uniqueSegments: VectorNetworkSegment[] = [];
      const seen = new Set<string>();
      for (const seg of segments) {
        const key = `${seg.a},${seg.b},${seg.ta[0]},${seg.ta[1]},${seg.tb[0]},${seg.tb[1]}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueSegments.push(seg);
        }
      }

      if (!remove_unused_verticies) {
        return { vertices, segments: uniqueSegments };
      }

      const used = new Set<number>();
      for (const seg of uniqueSegments) {
        used.add(seg.a);
        used.add(seg.b);
      }
      const vertexMap = new Map<number, number>();
      const filteredVertices: VectorNetworkVertex[] = [];
      vertices.forEach((v, i) => {
        if (used.has(i)) {
          vertexMap.set(i, filteredVertices.length);
          filteredVertices.push(v);
        }
      });
      const remappedSegments = uniqueSegments.map((seg) => ({
        a: vertexMap.get(seg.a)!,
        b: vertexMap.get(seg.b)!,
        ta: seg.ta,
        tb: seg.tb,
      }));
      return { vertices: filteredVertices, segments: remappedSegments };
    }

    /**
     * Creates a new {@link VectorNetwork} by combining two networks into one.
     *
     * The resulting network is optimized via {@link VectorNetworkEditor.optimize}
     * so that duplicate vertices or segments are removed. Segment orientation
     * is respected, meaning that a segment `a -> b` is considered different
     * from `b -> a`.
     *
     * @param a The base network.
     * @param b The network to merge into {@code a}.
     * @returns A new network containing the union of {@code a} and {@code b}.
     */
    static union(
      a: VectorNetwork,
      b: VectorNetwork,
      config?: OptimizationConfig | null
    ): VectorNetwork {
      const vertices: VectorNetworkVertex[] = [
        ...a.vertices.map((v): VectorNetworkVertex => [v[0], v[1]] as Vector2),
        ...b.vertices.map((v): VectorNetworkVertex => [v[0], v[1]] as Vector2),
      ];

      const offset = a.vertices.length;
      const segments: VectorNetworkSegment[] = [
        ...a.segments.map(
          (s): VectorNetworkSegment => ({
            a: s.a,
            b: s.b,
            ta: [s.ta[0], s.ta[1]] as Vector2,
            tb: [s.tb[0], s.tb[1]] as Vector2,
          })
        ),
        ...b.segments.map(
          (s): VectorNetworkSegment => ({
            a: s.a + offset,
            b: s.b + offset,
            ta: [s.ta[0], s.ta[1]] as Vector2,
            tb: [s.tb[0], s.tb[1]] as Vector2,
          })
        ),
      ];
      const result = { vertices, segments };
      if (config === null) {
        return result;
      }
      return VectorNetworkEditor.optimize(result, config ?? undefined);
    }

    /**
     * Translates every vertex in a {@link VectorNetwork} by the given delta.
     *
     * The returned network is a new object with all vertex positions shifted by
     * the provided offset. Segments and their tangents are preserved.
     *
     * @param net - The network to translate.
     * @param delta - The `[dx, dy]` offset applied to each vertex.
     * @returns A new {@link VectorNetwork} with translated vertices.
     */
    static translate(net: VectorNetwork, delta: Vector2): VectorNetwork {
      const [dx, dy] = delta;
      return {
        vertices: net.vertices.map(
          (v): VectorNetworkVertex => [v[0] + dx, v[1] + dy] as Vector2
        ),
        segments: net.segments.map((s) => ({ ...s })),
      };
    }

    /**
     * Converts a non-planar vector network into a planar network by detecting and resolving
     * segment intersections.
     *
     * **Planarization** is the process of transforming a vector network that contains
     * crossing segments into one where all segments only intersect at their endpoints
     * (vertices). This is essential for proper rendering, boolean operations, and
     * fill rule calculations.
     *
     * ## What is Planarization?
     *
     * A **planar network** is one where:
     * - All segments lie in a single 2D plane
     * - Segments only intersect at shared vertices
     * - No segments cross in the middle (transverse intersections)
     *
     * A **non-planar network** may have:
     * - Segments that cross each other at non-vertex points
     * - Ambiguous fill regions due to overlapping segments
     * - Inconsistent rendering behavior
     *
     * ## How Planarization Works
     *
     * 1. **Self-Intersection Detection**: Finds self-intersections within individual segments
     *    using the {@link cmath.bezier.intersection.single.intersection} algorithm
     * 2. **Cross-Intersection Detection**: Finds all pairwise intersections between segments
     *    using the {@link cmath.bezier.intersection.intersections} algorithm
     * 3. **Segment Splitting**: At each intersection point, splits the crossing segments
     *    into multiple sub-segments
     * 4. **Vertex Creation**: Creates new vertices at intersection points
     * 5. **Topology Update**: Updates segment connectivity to maintain the network structure
     *
     * ## Intersection Types Handled
     *
     * - **Self-Intersections**: A single curve intersects itself (figure-8 curves, loops)
     * - **Transverse**: Segments cross at a single point (most common)
     * - **Tangent**: Segments touch without crossing (may be preserved or split)
     * - **Endpoint**: Segments meet at a shared vertex (no action needed)
     * - **Overlap**: Segments share a common portion (creates multiple intersection points)
     *
     * ## Use Cases
     *
     * - **Boolean Operations**: Union, intersection, difference operations require planar networks
     * - **Fill Rendering**: Ensures consistent fill behavior with even-odd or non-zero rules
     * - **Path Simplification**: Removes redundant crossings for cleaner geometry
     * - **SVG Export**: Many SVG renderers expect planar paths
     *
     * ## Performance Considerations
     *
     * - Time complexity: O(n²) where n is the number of segments
     * - Uses spatial indexing for efficiency when possible
     * - Intersection detection is the most computationally expensive step
     * - Consider using {@link VectorNetworkEditor.optimize} after planarization
     *
     * ## Example
     *
     * ```ts
     * // Create a network with crossing segments
     * const network = new VectorNetworkEditor([
     *   [0, 0], [100, 100],  // diagonal segment
     *   [0, 100], [100, 0]   // crossing diagonal
     * ]);
     *
     * // Before planarization: segments cross in the middle
     * console.log(network.segments.length); // 2 segments
     *
     * // After planarization: segments split at intersection
     * network.planarize();
     * console.log(network.segments.length); // 4 segments (split at crossing)
     * ```
     *
     * ## Related Methods
     *
     * - {@link VectorNetworkEditor.optimize} - Removes duplicates after planarization
     * - {@link VectorNetworkEditor.union} - Boolean operations on planar networks
     * - {@link cmath.bezier.intersection.intersections} - Core intersection detection algorithm
     *
     * @remarks
     * This method modifies the vector network in-place. If you need to preserve
     * the original network, create a copy before calling this method.
     *
     * The planarization process may significantly increase the number of vertices
     * and segments, especially for networks with many crossings. Consider the
     * memory and performance implications for large networks.
     *
     * @param net - The vector network to planarize
     * @param config - Configuration options for segment splitting operations
     * @returns A new planarized {@link VectorNetwork}
     *
     * @see {@link cmath.bezier.intersection.single.intersection} - For self-intersection detection
     * @see {@link cmath.bezier.intersection.intersections} - For cross-intersection detection
     * @see {@link VectorNetworkEditor.optimize} - For post-planarization cleanup
     */
    static planarize(
      net: VectorNetwork,
      config: SplitSegmentConfig = { preserveZero: true }
    ): VectorNetwork {
      // Early exit if no segments to process
      if (net.segments.length === 0) {
        return { vertices: [...net.vertices], segments: [...net.segments] };
      }

      // Create a deep copy of the input network
      const result: VectorNetwork = {
        vertices: net.vertices.map((v) => [v[0], v[1]] as Vector2),
        segments: net.segments.map((s) => ({
          a: s.a,
          b: s.b,
          ta: [s.ta[0], s.ta[1]] as Vector2,
          tb: [s.tb[0], s.tb[1]] as Vector2,
        })),
      };

      // Track intersections to process
      const intersections: Array<{
        segmentA: number;
        segmentB: number;
        point: cmath.bezier.intersection.BezierIntersectionPoint;
      }> = [];

      // First, check for self-intersections in individual segments
      for (let i = 0; i < result.segments.length; i++) {
        const seg = result.segments[i];

        // Convert segment to bezier format for self-intersection detection
        const bezier: cmath.bezier.CubicBezierWithTangents = {
          a: result.vertices[seg.a],
          b: result.vertices[seg.b],
          ta: seg.ta,
          tb: seg.tb,
        };

        // Check for self-intersection
        const selfIntersection =
          cmath.bezier.intersection.single.intersection(bezier);

        if (selfIntersection) {
          // Create intersection points for both parameter values
          const point1: cmath.bezier.intersection.BezierIntersectionPoint = {
            a_t: selfIntersection.t1,
            b_t: selfIntersection.t2,
            p: selfIntersection.point,
            kind: cmath.bezier.intersection.IntersectionKind.Transverse,
            residual: 0,
          };

          const point2: cmath.bezier.intersection.BezierIntersectionPoint = {
            a_t: selfIntersection.t2,
            b_t: selfIntersection.t1,
            p: selfIntersection.point,
            kind: cmath.bezier.intersection.IntersectionKind.Transverse,
            residual: 0,
          };

          // Add both intersection points (segment intersects with itself)
          intersections.push({
            segmentA: i,
            segmentB: i,
            point: point1,
          });

          intersections.push({
            segmentA: i,
            segmentB: i,
            point: point2,
          });
        }
      }

      // Find all intersections between different segments
      for (let i = 0; i < result.segments.length; i++) {
        for (let j = i + 1; j < result.segments.length; j++) {
          const segA = result.segments[i];
          const segB = result.segments[j];

          // Convert segments to bezier format for intersection detection
          const bezierA: cmath.bezier.CubicBezierWithTangents = {
            a: result.vertices[segA.a],
            b: result.vertices[segA.b],
            ta: segA.ta,
            tb: segA.tb,
          };

          const bezierB: cmath.bezier.CubicBezierWithTangents = {
            a: result.vertices[segB.a],
            b: result.vertices[segB.b],
            ta: segB.ta,
            tb: segB.tb,
          };

          // Find intersections between these two segments
          const intersectionResult = cmath.bezier.intersection.intersections(
            bezierA,
            bezierB,
            {
              eps: 1e-6,
              paramEps: 1e-6,
              refine: true,
            }
          );

          // Process intersection points (ignore overlaps for now)
          for (const point of intersectionResult.points) {
            // Skip endpoint intersections as they don't require splitting
            if (
              point.kind === cmath.bezier.intersection.IntersectionKind.Endpoint
            ) {
              continue;
            }

            // Skip if intersection is at the very beginning or end of either segment
            if (
              point.a_t <= 1e-6 ||
              point.a_t >= 1 - 1e-6 ||
              point.b_t <= 1e-6 ||
              point.b_t >= 1 - 1e-6
            ) {
              continue;
            }

            intersections.push({
              segmentA: i,
              segmentB: j,
              point,
            });
          }
        }
      }

      // Sort intersections by parameter values to process them in order
      intersections.sort((a, b) => {
        // Sort by segment index first, then by parameter value
        if (a.segmentA !== b.segmentA) return a.segmentA - b.segmentA;
        return a.point.a_t - b.point.a_t;
      });

      // Process intersections and split segments
      const segmentsToSplit = new Map<
        number,
        Array<{
          t: number;
          point: Vector2;
          otherSegment: number;
        }>
      >();

      // Group intersections by segment
      for (const intersection of intersections) {
        if (!segmentsToSplit.has(intersection.segmentA)) {
          segmentsToSplit.set(intersection.segmentA, []);
        }

        // Handle self-intersections (segmentA === segmentB)
        if (intersection.segmentA === intersection.segmentB) {
          // For self-intersections, we need to add both parameter values to the same segment
          segmentsToSplit.get(intersection.segmentA)!.push({
            t: intersection.point.a_t,
            point: intersection.point.p,
            otherSegment: intersection.segmentA, // Same segment
          });

          // Also add the second parameter value for self-intersections
          segmentsToSplit.get(intersection.segmentA)!.push({
            t: intersection.point.b_t,
            point: intersection.point.p,
            otherSegment: intersection.segmentA, // Same segment
          });
        } else {
          // Handle cross-segment intersections
          if (!segmentsToSplit.has(intersection.segmentB)) {
            segmentsToSplit.set(intersection.segmentB, []);
          }

          segmentsToSplit.get(intersection.segmentA)!.push({
            t: intersection.point.a_t,
            point: intersection.point.p,
            otherSegment: intersection.segmentB,
          });

          segmentsToSplit.get(intersection.segmentB)!.push({
            t: intersection.point.b_t,
            point: intersection.point.p,
            otherSegment: intersection.segmentA,
          });
        }
      }

      // Split segments at intersection points
      const newSegments: VectorNetworkSegment[] = [];
      const processedSegments = new Set<number>();

      for (const [segmentIndex, splits] of Array.from(
        segmentsToSplit.entries()
      )) {
        if (processedSegments.has(segmentIndex)) continue;

        const segment = result.segments[segmentIndex];

        // Sort splits by parameter value and remove duplicates
        const uniqueSplits = splits
          .sort((a, b) => a.t - b.t)
          .filter((split, index, array) => {
            // Remove splits that are too close to each other (numerical precision)
            if (index === 0) return true;
            return Math.abs(split.t - array[index - 1].t) > 1e-6;
          });

        // Create new vertices for intersection points
        const newVertices: number[] = [];
        for (const split of uniqueSplits) {
          // Check if we already have a vertex at this point
          let vertexIndex = result.vertices.findIndex(
            (v) =>
              Math.abs(v[0] - split.point[0]) < 1e-6 &&
              Math.abs(v[1] - split.point[1]) < 1e-6
          );

          if (vertexIndex === -1) {
            vertexIndex = result.vertices.length;
            result.vertices.push([split.point[0], split.point[1]] as Vector2);
          }

          newVertices.push(vertexIndex);
        }

        // Split the segment into multiple sub-segments
        const bezierCurve: cmath.bezier.CubicBezierWithTangents = {
          a: result.vertices[segment.a],
          b: result.vertices[segment.b],
          ta: segment.ta,
          tb: segment.tb,
        };

        // Check if we should preserve zero tangents for UX purposes
        const preserveZero = config.preserveZero ?? true;
        const hasZeroTangents =
          segment.ta[0] === 0 &&
          segment.ta[1] === 0 &&
          segment.tb[0] === 0 &&
          segment.tb[1] === 0;

        let currentSegment = bezierCurve;
        let currentStartVertex = segment.a;

        for (let i = 0; i < uniqueSplits.length; i++) {
          const split = uniqueSplits[i];

          if (preserveZero && hasZeroTangents) {
            // For UX: Keep zero tangents to avoid confusing tangent controls
            // But still use Bézier evaluation to get the correct cursor position
            const splitPoint = cmath.bezier.evaluate(
              currentSegment.a,
              currentSegment.b,
              currentSegment.ta,
              currentSegment.tb,
              split.t
            );

            // Add the left sub-segment with zero tangents
            newSegments.push({
              a: currentStartVertex,
              b: newVertices[i],
              ta: [0, 0],
              tb: [0, 0],
            });

            // Update for next iteration
            currentSegment = {
              a: splitPoint,
              b: currentSegment.b,
              ta: [0, 0],
              tb: [0, 0],
            };
            currentStartVertex = newVertices[i];
          } else {
            // Use Bézier curve subdivision to get the correct tangent values
            // This ensures the composite curve is mathematically identical to the original
            const subdivision = cmath.bezier.subdivide(currentSegment, split.t);

            // Add the left sub-segment
            newSegments.push({
              a: currentStartVertex,
              b: newVertices[i],
              ta: subdivision.l.ta,
              tb: subdivision.l.tb,
            });

            // Update for next iteration
            currentSegment = subdivision.r;
            currentStartVertex = newVertices[i];
          }
        }

        // Add the final sub-segment
        newSegments.push({
          a: currentStartVertex,
          b: segment.b,
          ta: currentSegment.ta,
          tb: currentSegment.tb,
        });

        processedSegments.add(segmentIndex);
      }

      // Add segments that weren't split
      for (let i = 0; i < result.segments.length; i++) {
        if (!segmentsToSplit.has(i)) {
          newSegments.push(result.segments[i]);
        }
      }

      result.segments = newSegments;

      // Optimize the result to remove any duplicate vertices or segments
      return VectorNetworkEditor.optimize(result, {
        vertex_tolerance: 0.5,
        remove_unused_verticies: true,
      });
    }

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
        if (this._vertices[i][0] === p[0] && this._vertices[i][1] === p[1]) {
          return i;
        }
      }
      return null;
    }

    /**
     * Optimizes the current network in-place by removing duplicate vertices and
     * segments.
     *
     * This is the instance counterpart to
     * {@link VectorNetworkEditor.optimize | VectorNetworkEditor.optimize()} and
     * is sometimes referred to as *simplify* or *deduplicate*.
     *
     * @param config - Optimization options.
     * @returns The optimized {@link VectorNetwork}.
     */
    optimize(
      config: OptimizationConfig = {
        vertex_tolerance: 0,
        remove_unused_verticies: true,
      }
    ): VectorNetwork {
      const optimized = VectorNetworkEditor.optimize(this.value, config);
      this._vertices = optimized.vertices;
      this._segments = optimized.segments;
      return optimized;
    }

    /**
     * Converts the current vector network into a planar network by detecting and resolving
     * segment intersections in-place.
     *
     * This is the instance counterpart to
     * {@link VectorNetworkEditor.planarize | VectorNetworkEditor.planarize()}.
     * Unlike the static method, this modifies the current network instance directly.
     *
     * **Planarization** transforms a network with crossing segments into one where
     * all segments only intersect at their endpoints (vertices). This is essential
     * for proper rendering, boolean operations, and fill rule calculations.
     *
     * ## What Happens During Planarization
     *
     * 1. **Self-Intersection Detection**: Finds self-intersections within individual segments
     *    using the {@link cmath.bezier.intersection.single.intersection} algorithm
     * 2. **Cross-Intersection Detection**: Finds all pairwise intersections between segments
     *    using the {@link cmath.bezier.intersections} algorithm
     * 3. **Segment Splitting**: At each intersection point, splits the crossing segments
     *    into multiple sub-segments
     * 4. **Vertex Creation**: Creates new vertices at intersection points
     * 5. **Topology Update**: Updates segment connectivity to maintain the network structure
     * 6. **Optimization**: Automatically optimizes the result to remove duplicates
     *
     * ## Example
     *
     * ```ts
     * const editor = new VectorNetworkEditor(network);
     *
     * // Before: network has crossing segments and self-intersecting curves
     * console.log(editor.segments.length); // 2 segments
     *
     * // After: segments split at intersections (including self-intersections)
     * editor.planarize();
     * console.log(editor.segments.length); // 4+ segments (split at crossings)
     * ```
     *
     * @param config - Configuration options for segment splitting operations
     * @returns The planarized {@link VectorNetwork} (same as the modified instance)
     *
     * @remarks
     * This method modifies the current network instance in-place. If you need to
     * preserve the original network, create a copy before calling this method.
     *
     * The planarization process may significantly increase the number of vertices
     * and segments, especially for networks with many crossings or self-intersections.
     * Consider the memory and performance implications for large networks.
     *
     * @see {@link VectorNetworkEditor.planarize} - Static version that returns a new network
     * @see {@link cmath.bezier.intersection.single.intersection} - For self-intersection detection
     * @see {@link cmath.bezier.intersections} - For cross-intersection detection
     */
    planarize(
      config: SplitSegmentConfig = { preserveZero: true }
    ): VectorNetwork {
      const planarized = VectorNetworkEditor.planarize(this.value, config);
      this._vertices = planarized.vertices;
      this._segments = planarized.segments;
      return planarized;
    }

    /**
     * Creates a packed {@link VectorNetwork} containing only the specified
     * vertices and segments from the current network.
     *
     * The copied network is normalized through
     * {@link VectorNetworkEditor.optimize}, ensuring that vertex indices are
     * re-packed starting from zero and that duplicate vertices or segments are
     * removed. Vertices referenced by the copied segments are automatically
     * included. Vertices explicitly provided in the selection are preserved
     * even if they are not part of any segment unless
     * `config.remove_unused_verticies` is set to `true`.
     *
     * @param selection - Indices of elements to copy.
     * @param selection.vertices - Vertex indices to include. These vertices are
     *   always copied and are kept even if no segment references them.
     * @param selection.segments - Segment indices to include. The endpoint
     *   vertices for these segments are automatically added to the selection.
     * @param config - Optimization options applied to the resulting network.
     *   Defaults to keeping unused vertices.
     * @returns A new, packed {@link VectorNetwork} containing the selected
     *   subset of this editor's network.
     */
    copy(
      selection: { vertices?: number[]; segments?: number[] },
      config: OptimizationConfig = {
        vertex_tolerance: 0,
        remove_unused_verticies: false,
      }
    ): VectorNetwork {
      const vertexSet = new Set<number>(selection.vertices ?? []);
      const segments: VectorNetworkSegment[] = [];

      for (const si of selection.segments ?? []) {
        const seg = this._segments[si];
        if (!seg) continue;
        segments.push({
          a: seg.a,
          b: seg.b,
          ta: [seg.ta[0], seg.ta[1]] as Vector2,
          tb: [seg.tb[0], seg.tb[1]] as Vector2,
        });
        vertexSet.add(seg.a);
        vertexSet.add(seg.b);
      }

      const vertexIndices = Array.from(vertexSet).sort((a, b) => a - b);
      const indexMap = new Map<number, number>();
      const vertices: VectorNetworkVertex[] = vertexIndices.map((vi, idx) => {
        indexMap.set(vi, idx);
        const v = this._vertices[vi];
        return [v[0], v[1]] as Vector2;
      });

      const packedSegments = segments.map((seg) => ({
        a: indexMap.get(seg.a)!,
        b: indexMap.get(seg.b)!,
        ta: seg.ta,
        tb: seg.tb,
      }));

      return VectorNetworkEditor.optimize(
        { vertices, segments: packedSegments },
        config
      );
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
     * Returns the vertices that are directly connected to the specified
     * vertex via segments.
     *
     * A vertex is considered a neighbour when it shares a segment with the
     * input vertex. The result does not include the input vertex itself and
     * duplicates are removed.
     *
     * @param vertexIndex - index of the vertex to query
     * @returns array of neighbouring vertex indices
     */
    getNeighboringVerticies(vertexIndex: number): number[] {
      const neighbours = new Set<number>();
      for (const seg of this._segments) {
        if (seg.a === vertexIndex) neighbours.add(seg.b);
        if (seg.b === vertexIndex) neighbours.add(seg.a);
      }
      return Array.from(neighbours).sort((a, b) => a - b);
    }

    /**
     * Returns the length of the segment at the given index.
     */
    segmentLength(segmentIndex: number): number {
      const seg = this._segments[segmentIndex];
      const a = this._vertices[seg.a];
      const b = this._vertices[seg.b];
      return Math.hypot(b[0] - a[0], b[1] - a[1]);
    }

    /**
     * Determines whether the specified segments form a closed (valid) loop.
     *
     * The segments must be provided in order such that each segment's
     * ending vertex (`b`) matches the starting vertex (`a`) of the next
     * segment. A loop is considered closed when all segments connect in
     * sequence and the final segment links back to the first.
     *
     * @param segmentIndices - indices of segments to check
     * @returns `true` if the segments form a closed loop, otherwise `false`
     */
    isLoopClosed(loop: Loop): boolean {
      if (loop.length === 0) return false;

      for (let i = 0; i < loop.length; i++) {
        const current = this._segments[loop[i]];
        const next = this._segments[loop[(i + 1) % loop.length]];

        if (!current || !next) return false;
        if (current.b !== next.a) return false;
      }

      return true;
    }

    /**
     * Enumerates all bounded, minimal, non-overlapping loops (faces) in a planar {@link VectorNetwork}.
     *
     * ## Overview
     * This function takes a vector network (vertices + segments), treats it as a
     * planar straight-line graph, and returns an array of loops. Each loop is an
     * array of segment indices that form a closed, counter-clockwise cycle
     * representing a bounded face in the network.
     *
     * The unbounded (outer) face is detected and excluded from the results.
     * The algorithm respects Euler's characteristic for planar graphs:
     *
     * ```
     * loops.length = E - V + C
     * ```
     *
     * where:
     * - `E` = number of segments
     * - `V` = number of vertices
     * - `C` = number of connected components in the graph
     *
     * ## Algorithm
     * 1. Builds **half-edges** (two directed edges per segment) with twin pointers.
     * 2. Groups outgoing half-edges per vertex and sorts them in **clockwise** order
     *    using the geometric ray angle `atan2(P[v] - P[u])`. This avoids reliance on
     *    curve tangents, so it works for straight-line segments and zero tangents.
     * 3. Uses the **left-hand rule**: from a half-edge, go to its twin, then to the
     *    previous half-edge in the CW rotation around that vertex — this walks the
     *    boundary of the face to the left of the original half-edge.
     * 4. Marks visited half-edges so each bounded face is traversed exactly once.
     * 5. Computes the signed area of each face to:
     *    - Ensure counter-clockwise orientation for bounded faces.
     *    - Identify and remove the outer face (largest absolute area).
     *
     * ## Notes
     * - Assumes the input is already **planarized**: all intersections occur at vertices,
     *   and segment endpoints reference valid vertex indices.
     * - Degree-1 vertices (bridges or dangling edges) do not contribute to bounded faces.
     * - Works for multiple connected components.
     * - Robust for parallel or collinear edges — tie-broken by edge length and index.
     *
     * ## Complexity
     * - Time: `O(E log d_max)` from sorting edges at each vertex (`d_max` = max degree).
     * - Space: `O(E)` for half-edge structures and auxiliary arrays.
     *
     * @returns An array of loops, where each loop is an array of segment indices forming a bounded face in CCW order.
     *
     * @example
     * ```ts
     * const loops = getLoops.call({ value: vectorNetwork });
     * // loops might be:
     * // [
     * //   [0, 1, 2], // triangle
     * //   [3, 4, 5, 6] // rectangle
     * // ]
     * ```
     */
    getLoops(): Loop[] {
      const { vertices: P, segments: S } = this.value;
      const E = S.length;
      if (!E) return [];

      // ---- half-edges ----
      const U = new Int32Array(2 * E);
      const V = new Int32Array(2 * E);
      const SEG = new Int32Array(2 * E);
      for (let e = 0; e < E; e++) {
        const s = S[e],
          h0 = 2 * e,
          h1 = h0 + 1;
        U[h0] = s.a;
        V[h0] = s.b;
        SEG[h0] = e;
        U[h1] = s.b;
        V[h1] = s.a;
        SEG[h1] = e;
      }
      const twin = (h: number) => h ^ 1;

      // ---- per-vertex rotation by geometric ray angle u->v (robust for ta/tb=0) ----
      const OUT: number[][] = Array.from({ length: P.length }, () => []);
      for (let h = 0; h < 2 * E; h++) OUT[U[h]].push(h);

      const ang = (u: number, v: number) => {
        const a = P[u],
          b = P[v];
        return Math.atan2(b[1] - a[1], b[0] - a[0]);
      };

      for (let u = 0; u < P.length; u++) {
        const arr = OUT[u];
        arr.sort((i, j) => {
          const ai = ang(U[i], V[i]);
          const aj = ang(U[j], V[j]);
          if (aj !== ai) return aj - ai; // CW order
          // tie-break: farther edge first to stabilize collinear multi-edges
          const di =
            (P[V[i]][0] - P[U[i]][0]) ** 2 + (P[V[i]][1] - P[U[i]][1]) ** 2;
          const dj =
            (P[V[j]][0] - P[U[j]][0]) ** 2 + (P[V[j]][1] - P[U[j]][1]) ** 2;
          return dj - di || SEG[i] - SEG[j] || i - j;
        });
      }

      // position of half-edge within the rotation
      const POS = new Int32Array(2 * E).fill(-1);
      for (let u = 0; u < P.length; u++) {
        const r = OUT[u];
        for (let k = 0; k < r.length; k++) POS[r[k]] = k;
      }

      // next-around-face (left of edge): prev in CW from the twin
      const next = (h: number) => {
        const t = twin(h);
        const v = U[t];
        const r = OUT[v];
        if (r.length < 2) return -1; // degree-0/1 => cannot bound a face
        const k = POS[t];
        const kPrev = (k - 1 + r.length) % r.length;
        return r[kPrev];
      };

      // ---- face walk ----
      const seen = new Uint8Array(2 * E);
      const facesHE: number[][] = [];
      for (let h0 = 0; h0 < 2 * E; h0++) {
        if (seen[h0]) continue;
        // skip bridges/leaf edges early
        if (OUT[U[h0]].length < 2 || OUT[V[h0]].length < 2) {
          seen[h0] = 1;
          seen[twin(h0)] = 1;
          continue;
        }
        let h = h0;
        const cyc: number[] = [];
        while (h !== -1 && !seen[h]) {
          seen[h] = 1;
          cyc.push(h);
          h = next(h);
        }
        if (h === h0 && cyc.length >= 3) facesHE.push(cyc);
      }

      // ---- area / orientation; drop outer ----
      const areaOfHE = (loop: number[]) => {
        let s = 0;
        for (let i = 0; i < loop.length; i++) {
          const a = P[U[loop[i]]],
            b = P[V[loop[i]]];
          s += a[0] * b[1] - a[1] * b[0];
        }
        return 0.5 * s; // >0 CCW
      };
      const areas = facesHE.map(areaOfHE);
      let outer = -1,
        outerAbs = -1;
      for (let i = 0; i < areas.length; i++) {
        const A = Math.abs(areas[i]);
        if (A > outerAbs) {
          outerAbs = A;
          outer = i;
        }
      }

      const loops: Loop[] = [];
      for (let i = 0; i < facesHE.length; i++) {
        if (i === outer) continue;
        const he =
          areas[i] > 0 ? facesHE[i] : facesHE[i].slice().reverse().map(twin);
        const segLoop: number[] = [];
        for (const h of he) {
          const e = SEG[h];
          if (!segLoop.length || segLoop[segLoop.length - 1] !== e)
            segLoop.push(e);
        }
        if (segLoop.length >= 3) loops.push(segLoop);
      }
      return loops;
    }

    getLoopPathData(loop: Loop): string {
      const { vertices, segments } = this.value;
      const commands: SVGCommand[] = [];

      // No segments in loop means nothing to draw
      if (loop.length === 0) {
        return "";
      }

      let current_start: number | null = null;
      let previous_end: number | null = null;

      // Process each segment in the loop
      for (const segmentIndex of loop) {
        const segment = segments[segmentIndex];
        const { a, b, ta, tb } = segment;
        const start = vertices[a];
        const end = vertices[b];

        // Start a new subpath if this segment does not connect to the previous one
        if (previous_end !== a) {
          commands.push({
            type: SVGPathData.MOVE_TO,
            x: start[0],
            y: start[1],
            relative: false,
          });
          current_start = a;
        }

        // Straight line when both tangents are zero
        if (ta[0] === 0 && ta[1] === 0 && tb[0] === 0 && tb[1] === 0) {
          commands.push({
            type: SVGPathData.LINE_TO,
            x: end[0],
            y: end[1],
            relative: false,
          });
        } else {
          const c1 = [start[0] + ta[0], start[1] + ta[1]];
          const c2 = [end[0] + tb[0], end[1] + tb[1]];
          commands.push({
            type: SVGPathData.CURVE_TO,
            x1: c1[0],
            y1: c1[1],
            x2: c2[0],
            y2: c2[1],
            x: end[0],
            y: end[1],
            relative: false,
          });
        }

        previous_end = b;

        // Close the path if we've reached the starting point
        if (current_start !== null && b === current_start) {
          commands.push({ type: SVGPathData.CLOSE_PATH });
          previous_end = null;
          current_start = null;
        }
      }

      // If the loop doesn't automatically close (e.g., if the last segment doesn't connect to the first),
      // we need to close it manually
      if (current_start !== null && previous_end !== null) {
        const firstSegment = segments[loop[0]];
        const lastSegment = segments[loop[loop.length - 1]];

        // Check if the loop is actually closed by comparing the last vertex with the first vertex
        if (lastSegment.b !== firstSegment.a) {
          // Add a line to close the path
          const firstVertex = vertices[firstSegment.a];
          commands.push({
            type: SVGPathData.LINE_TO,
            x: firstVertex[0],
            y: firstVertex[1],
            relative: false,
          });
        }

        commands.push({ type: SVGPathData.CLOSE_PATH });
      }

      return encodeSVGPath(commands);
    }

    /**
     * checks whether the vertex is connected to exactly two segments
     */
    isExactCorner(vertex: number): boolean {
      return this.findSegments(vertex).length === 2;
    }

    /**
     * Sets tangents for a corner by assigning the given tangent to one
     * connected segment and its mirrored counterpart to the other. When `t`
     * is `0`, all tangents at the corner are cleared.
     */
    setCornerTangents(vertex: number, t: Vector2 | 0) {
      const segs = this.findSegments(vertex);
      if (segs.length !== 2) return;

      const segA = this._segments[segs[0]];
      const segB = this._segments[segs[1]];
      const controlA = segA.a === vertex ? "ta" : "tb";
      const controlB = segB.a === vertex ? "ta" : "tb";

      if (t === 0 || cmath.vector2.isZero(t)) {
        segA[controlA] = [0, 0];
        segB[controlB] = [0, 0];
      } else {
        segA[controlA] = [t[0], t[1]];
        segB[controlB] = [-t[0], -t[1]];
      }
    }

    /**
     * Bends a sharp corner into a smooth one by assigning mirrored tangents.
     *
     * The tangent length is derived from the length of the reference segment
     * and the {@link cmath.KAPPA} constant so that bending four equal-length sides
     * yields a perfect circle.
     *
     * @param vertex index of the vertex to bend
     * @param ref optional reference control (`"ta"` or `"tb"`) used only to
     *            determine which connected segment provides the length used for
     *            both tangents. The angle of the tangents is computed from the
     *            geometry of the two connected segments and is unaffected by
     *            the reference.
     */
    bendCorner(vertex: number, ref?: "ta" | "tb") {
      if (!this.isExactCorner(vertex)) return;

      const segs = this.findSegments(vertex);
      if (segs.length !== 2) return;

      const data = segs.map((si) => {
        const seg = this._segments[si];
        const control = seg.a === vertex ? "ta" : "tb";
        const other = seg.a === vertex ? seg.b : seg.a;
        const p = this._vertices[vertex];
        const op = this._vertices[other];
        const vx = op[0] - p[0];
        const vy = op[1] - p[1];
        const len = Math.hypot(vx, vy);
        const dir: Vector2 = len === 0 ? [0, 0] : [vx / len, vy / len];
        return { si, control, dir, len } as const;
      });

      // determine the reference segment for length calculation
      const refData = (ref && data.find((d) => d.control === ref)) || data[0];

      // compute the angle bisector
      const bx = data[0].dir[0] + data[1].dir[0];
      const by = data[0].dir[1] + data[1].dir[1];
      if (bx === 0 && by === 0) return; // degenerate (straight line)
      const bisector: Vector2 = [bx, by];

      // base tangent direction: bisector rotated 90° counter-clockwise
      const baseTangent: Vector2 = [-bisector[1], bisector[0]];

      // determine orientation using cross product between the bisector and the first segment direction
      // This determines the correct orientation for the tangents
      const cross = bisector[0] * data[0].dir[1] - bisector[1] * data[0].dir[0];
      const segA = this._segments[data[0].si];
      const segB = this._segments[data[1].si];

      // Scale each tangent based on its segment length
      // If reference is specified, both tangents use the reference segment's length
      // Otherwise, each tangent uses its own segment's length
      const scaleA = ref
        ? (refData.len / 2) * cmath.KAPPA
        : (data[0].len / 2) * cmath.KAPPA;
      const scaleB = ref
        ? (refData.len / 2) * cmath.KAPPA
        : (data[1].len / 2) * cmath.KAPPA;

      if (cross < 0) {
        segA[data[0].control] = [
          -baseTangent[0] * scaleA,
          -baseTangent[1] * scaleA,
        ];
        segB[data[1].control] = [
          baseTangent[0] * scaleB,
          baseTangent[1] * scaleB,
        ];
      } else {
        segA[data[0].control] = [
          baseTangent[0] * scaleA,
          baseTangent[1] * scaleA,
        ];
        segB[data[1].control] = [
          -baseTangent[0] * scaleB,
          -baseTangent[1] * scaleB,
        ];
      }
    }

    /**
     * Bends a straight segment so that the resulting cubic Bézier curve passes
     * through the given target point while maintaining the relative offset of
     * the cursor from the segment's start.
     *
     * The offset point `ca` represents where the bending gesture started and is
     * used to derive the parametric location along the segment. The point `cb`
     * is the current cursor position that the curve should pass through. Both
     * coordinates are in the vector network's local space.
     *
     * The function handles coordinate space transformations to ensure consistency
     * when the vector network is repositioned by the editor.
     *
     * If the cursor lies on the original straight line (i.e. `cb` equals the
     * linear interpolation of the segment at the computed offset), the tangents
     * are cleared and the segment remains straight.
     *
     * @param segment index of the segment to bend
     * @param ca parametric position (0-1) where the bend gesture started
     * @param cb vector network local space point the segment should pass through
     * @param frozen frozen segment state containing original coordinates and tangents
     */
    bendSegment(
      segment: number,
      ca: number,
      cb: Vector2,
      frozen: { a: Vector2; b: Vector2; ta: Vector2; tb: Vector2 }
    ) {
      const seg = this._segments[segment];
      if (!seg) return;

      // Calculate the offset from frozen state to current state
      const currentA = this._vertices[seg.a];
      const offsetA: Vector2 = [
        currentA[0] - frozen.a[0],
        currentA[1] - frozen.a[1],
      ];

      // Adjust cb to be relative to the frozen segment position
      const adjustedCb: Vector2 = [cb[0] - offsetA[0], cb[1] - offsetA[1]];

      // Use the cmath.bezier.solveTangentsForPoint function to solve for new tangent values
      const [newTa, newTb] = cmath.bezier.solveTangentsForPoint(
        frozen.a,
        frozen.b,
        frozen.ta,
        frozen.tb,
        ca,
        adjustedCb
      );

      // Apply the solution
      seg.ta = newTa;
      seg.tb = newTb;
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
        vertex_idx = this._vertices.push(p) - 1;
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

    /**
     * Removes the vertex at the given index if no segments reference it.
     *
     * If the vertex has any dependent segments, the network is left unchanged
     * and `false` is returned. When the vertex is removed, all segment indices
     * greater than the removed index are decremented to reflect the new
     * positions of vertices.
     *
     * @param i - Index of the vertex to remove
     * @returns `true` if the vertex was removed, `false` otherwise
     */
    removeUnusedVertex(i: number): boolean {
      if (i < 0 || i >= this._vertices.length) {
        throw new Error(`Invalid vertex index: ${i}`);
      }

      const hasDependents = this._segments.some(
        (segment) => segment.a === i || segment.b === i
      );
      if (hasDependents) {
        return false;
      }

      this._vertices.splice(i, 1);
      for (const seg of this._segments) {
        if (seg.a > i) seg.a--;
        if (seg.b > i) seg.b--;
      }

      return true;
    }

    moveVertex(i: number, p: Vector2) {
      if (i < 0 || i >= this._vertices.length) {
        throw new Error(`Invalid vertex index: ${i}`);
      }
      this._vertices[i] = p;
    }

    translateVertex(i: number, delta: Vector2) {
      if (i < 0 || i >= this._vertices.length) {
        throw new Error(`Invalid vertex index: ${i}`);
      }
      const p = this._vertices[i];
      this._vertices[i] = [p[0] + delta[0], p[1] + delta[1]];
    }

    translateSegment(i: number, delta: Vector2) {
      if (i < 0 || i >= this._segments.length) {
        throw new Error(`Invalid segment index: ${i}`);
      }
      const seg = this._segments[i];
      this.translateVertex(seg.a, delta);
      this.translateVertex(seg.b, delta);
    }

    translate(delta: Vector2) {
      this._vertices = this._vertices.map((v) => [
        v[0] + delta[0],
        v[1] + delta[1],
      ]);
    }

    scale(factor: Vector2) {
      this._vertices = this._vertices.map((v) =>
        cmath.vector2.multiply(v, factor)
      );
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
     * Deletes the segment at the given index.
     *
     * @param segmentIndex - Index of the segment to delete
     *
     * @example
     * ```
     * => vertices: [ A, B, C, D ]
     * => segments: [ AB, BC, CD ]
     * => deleteSegment(1) // delete BC
     * => vertices: [ A, B, C, D ]
     * => segments: [ AB, CD ]
     * ```
     */
    deleteSegment(segmentIndex: number) {
      if (segmentIndex < 0 || segmentIndex >= this._segments.length) {
        throw new Error(`Invalid segment index: ${segmentIndex}`);
      }

      // Remove the segment at the given index
      this._segments.splice(segmentIndex, 1);
    }

    deleteTangent(segmentIndex: number, control: "ta" | "tb") {
      if (segmentIndex < 0 || segmentIndex >= this._segments.length) {
        throw new Error(`Invalid segment index: ${segmentIndex}`);
      }
      this._segments[segmentIndex][control] = [0, 0];
    }

    /**
     * Splits a segment at a given parametric position and inserts a new vertex.
     *
     * This function works with both straight and curved segments. When splitting,
     * it maintains visual continuity by calculating appropriate tangent values
     * for the new segments that preserve the original curve shape.
     *
     * The splitting process uses Bézier curve subdivision to ensure the composite
     * curve is mathematically identical to the original:
     * 1. Evaluates the curve at the given parametric position to get the split point
     * 2. Uses Bézier subdivision to calculate the correct tangent values for both segments
     * 3. Creates two new segments that maintain the original curve shape exactly
     * 4. Inserts a new vertex at the split point
     *
     * When `preserveZero` is enabled in the config (default: true), segments with zero tangents
     * will maintain zero tangents after splitting, avoiding the introduction of
     * unnecessary tangent controls that might confuse users. This is particularly
     * useful for straight line segments where the mathematical accuracy of de
     * Casteljau's algorithm would introduce non-zero tangents.
     *
     * @param si index of the segment to split
     * @param p parametric position on the segment (0 ≤ t ≤ 1)
     * @param config optional configuration for the split operation
     * @returns index of the newly inserted vertex
     */
    splitSegment(
      si: number,
      p: PointOnSegment,
      config: SplitSegmentConfig = { preserveZero: true }
    ): number {
      if (si < 0 || si >= this._segments.length) {
        throw new Error(`Invalid segment index: ${si}`);
      }

      if (p.segment !== si) {
        throw new Error(
          `PointOnSegment segment index (${p.segment}) does not match segment index (${si})`
        );
      }

      const seg = this._segments[si];
      const a = this._vertices[seg.a];
      const b = this._vertices[seg.b];
      const ta = seg.ta;
      const tb = seg.tb;
      const t = p.t;

      // Clamp t to [0, 1] for robustness
      const clampedT = Math.max(0, Math.min(1, t));

      // Check if we should preserve zero tangents for UX purposes
      const preserveZero = config.preserveZero ?? false;
      const hasZeroTangents =
        ta[0] === 0 && ta[1] === 0 && tb[0] === 0 && tb[1] === 0;

      let segment1: VectorNetworkSegment;
      let segment2: VectorNetworkSegment;
      let vertexIndex: number;

      if (preserveZero && hasZeroTangents) {
        // For UX: Keep zero tangents to avoid confusing tangent controls
        // But still use Bézier evaluation to get the correct cursor position
        const splitPoint = cmath.bezier.evaluate(a, b, ta, tb, clampedT);

        // Insert the new vertex at the split point
        vertexIndex = this._vertices.push(splitPoint) - 1;

        // Create segments with zero tangents
        segment1 = {
          a: seg.a,
          b: vertexIndex,
          ta: [0, 0],
          tb: [0, 0],
        };

        segment2 = {
          a: vertexIndex,
          b: seg.b,
          ta: [0, 0],
          tb: [0, 0],
        };
      } else {
        // Use Bézier curve subdivision to get the correct tangent values
        // This ensures the composite curve is mathematically identical to the original
        const subdivision = cmath.bezier.subdivide({ a, b, ta, tb }, clampedT);
        const splitPoint = subdivision.s;

        // Insert the new vertex at the split point
        vertexIndex = this._vertices.push(splitPoint) - 1;

        // Create the first segment: from original start to split point
        segment1 = {
          a: seg.a,
          b: vertexIndex,
          ta: subdivision.l.ta,
          tb: subdivision.l.tb,
        };

        // Create the second segment: from split point to original end
        segment2 = {
          a: vertexIndex,
          b: seg.b,
          ta: subdivision.r.ta,
          tb: subdivision.r.tb,
        };
      }

      // Replace the original segment with the two new segments
      this._segments.splice(si, 1, segment1, segment2);

      return vertexIndex;
    }

    /**
     *
     * @param segment the index of the segment to update
     * @param control the control point to update (ta or tb)
     * @param value the new tangent value
     * @param mirroring the tangent mirroring mode
     *
     */
    updateTangent(
      segmentIndex: number,
      control: "ta" | "tb",
      value: Vector2,
      mirroring: TangentMirroringMode = "auto"
    ) {
      const seg = this._segments[segmentIndex];
      const vertexIndex = control === "ta" ? seg.a : seg.b;

      // find connected segment sharing this vertex
      const connected = this._segments
        .map((s, i) => ({ s, i }))
        .filter(
          ({ s, i }) =>
            i !== segmentIndex && (s.a === vertexIndex || s.b === vertexIndex)
        );

      let effectiveMirroring: TangentMirroringMode = mirroring;
      let connection: { i: number; otherControl: "ta" | "tb" } | null = null;

      if (connected.length === 1) {
        const { s, i } = connected[0];
        const otherControl = s.a === vertexIndex ? "ta" : "tb";
        connection = { i, otherControl };

        if (mirroring === "auto") {
          const current = seg[control];
          const other = this._segments[i][otherControl];
          effectiveMirroring = inferMirroringMode(current, other);
        }
      } else if (mirroring === "auto") {
        effectiveMirroring = "none";
      }

      // 1. update the primary tangent
      this._segments[segmentIndex][control] = value;

      // 2. optional reflection
      if (effectiveMirroring === "none" || !connection) return;

      if (effectiveMirroring === "all") {
        // mirror angle and length
        this._segments[connection.i][connection.otherControl] = [
          -value[0],
          -value[1],
        ];
      } else if (effectiveMirroring === "angle") {
        // mirror only angle, keep existing length
        const existing = this._segments[connection.i][connection.otherControl];
        const length = Math.hypot(existing[0], existing[1]);
        const angle = Math.atan2(value[1], value[0]) + Math.PI;
        this._segments[connection.i][connection.otherControl] = [
          Math.cos(angle) * length,
          Math.sin(angle) * length,
        ];
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
      const pl = polyline([...this._vertices.map((v) => v), p]);
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
      this._vertices = [a, b];
      this._segments = [{ a: 0, b: 1, ta: [0, 0], tb: [0, 0] }];
    }

    /**
     * Returns the vertex index associated with a segment's tangent control.
     *
     * @param segmentIndex the index of the segment
     * @param control which tangent control of the segment ("ta" or "tb")
     * @returns the index of the vertex owning the specified control
     */
    getTangentVertex(segmentIndex: number, control: "ta" | "tb"): number {
      const seg = this._segments[segmentIndex];
      return control === "ta" ? seg.a : seg.b;
    }

    /**
     * Returns absolute positions of vertices.
     * @param offset translate offset
     * @param indices optional subset of vertex indices
     */
    getVerticesAbsolute(
      offset: Vector2 = [0, 0],
      indices?: number[]
    ): Vector2[] {
      const idx = indices ?? this._vertices.map((_, i) => i);
      return idx.map((i) => {
        const p = this._vertices[i];
        return [p[0] + offset[0], p[1] + offset[1]] as Vector2;
      });
    }

    /**
     * Returns absolute positions of tangent control points.
     * @param offset translate offset
     */
    getControlPointsAbsolute(
      offset: Vector2 = [0, 0],
      targets?: [number, "ta" | "tb"][]
    ): AbsoluteTangentControlOnSegment[] {
      const result: {
        segment: number;
        control: "ta" | "tb";
        point: Vector2;
      }[] = [];
      const source = targets
        ? targets.map((t) => ({ segment: t[0], control: t[1] }))
        : this._segments.flatMap((_, i) => [
            { segment: i, control: "ta" as const },
            { segment: i, control: "tb" as const },
          ]);

      for (const { segment, control } of source) {
        const seg = this._segments[segment];
        const vertex = this._vertices[control === "ta" ? seg.a : seg.b];
        const tangent = seg[control];
        result.push({
          segment,
          control,
          point: [
            vertex[0] + tangent[0] + offset[0],
            vertex[1] + tangent[1] + offset[1],
          ],
        });
      }
      return result;
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
      pts.push(v);
    }

    // 2. collect tangent endpoints (a + ta, b + tb)
    for (const seg of vn.segments) {
      const a = vn.vertices[seg.a];
      const b = vn.vertices[seg.b];
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
    if (vn.segments.length === 0) {
      // fallback to a simple point-based bounding box when no segments exist
      return cmath.rect.fromPoints(vn.vertices.map((v) => v));
    }

    let box = { x: Infinity, y: Infinity, width: 0, height: 0 };
    for (const seg of vn.segments) {
      const { a: _a, b: _b, ta, tb } = seg;
      const a = vn.vertices[_a];
      const b = vn.vertices[_b];
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

    const commands: SVGCommand[] = [];

    // No segments means nothing to draw
    if (segments.length === 0) {
      return "";
    }

    let current_start: number | null = null;
    let previous_end: number | null = null;

    for (const segment of segments) {
      const { a, b, ta, tb } = segment;
      const start = vertices[a];
      const end = vertices[b];

      // Start a new subpath if this segment does not connect
      if (previous_end !== a) {
        commands.push({
          type: SVGPathData.MOVE_TO,
          x: start[0],
          y: start[1],
          relative: false,
        });
        current_start = a;
      }

      // Straight line when both tangents are zero
      if (ta[0] === 0 && ta[1] === 0 && tb[0] === 0 && tb[1] === 0) {
        commands.push({
          type: SVGPathData.LINE_TO,
          x: end[0],
          y: end[1],
          relative: false,
        });
      } else {
        const c1 = [start[0] + ta[0], start[1] + ta[1]];
        const c2 = [end[0] + tb[0], end[1] + tb[1]];
        commands.push({
          type: SVGPathData.CURVE_TO,
          x1: c1[0],
          y1: c1[1],
          x2: c2[0],
          y2: c2[1],
          x: end[0],
          y: end[1],
          relative: false,
        });
      }

      previous_end = b;

      if (current_start !== null && b === current_start) {
        commands.push({ type: SVGPathData.CLOSE_PATH });
        previous_end = null;
        current_start = null;
      }
    }

    return encodeSVGPath(commands);
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
      [x, y], // Top-left
      [x + width, y], // Top-right
      [x + width, y + height], // Bottom-right
      [x, y + height], // Bottom-left
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

  /**
   * @param shape ellipse shape defined with reactable (xywh)
   * @returns vector network with 4 cubic bezier curves
   */
  export function fromEllipse(shape: cmath.Rectangle): vn.VectorNetwork {
    const { x, y, width, height } = shape;

    const cx = x + width / 2;
    const cy = y + height / 2;
    const rx = width / 2;
    const ry = height / 2;

    // Constant for approximating a quarter of a circle with a cubic Bézier curve
    // See: https://spencermortensen.com/articles/bezier-circle/
    const kx = rx * cmath.KAPPA;
    const ky = ry * cmath.KAPPA;

    const vertices: vn.VectorNetworkVertex[] = [
      [cx, cy - ry], // Top
      [cx + rx, cy], // Right
      [cx, cy + ry], // Bottom
      [cx - rx, cy], // Left
    ];

    const segments: vn.VectorNetworkSegment[] = [
      // Top -> Right
      { a: 0, b: 1, ta: [kx, 0], tb: [0, -ky] },
      // Right -> Bottom
      { a: 1, b: 2, ta: [0, ky], tb: [kx, 0] },
      // Bottom -> Left
      { a: 2, b: 3, ta: [-kx, 0], tb: [0, ky] },
      // Left -> Top
      { a: 3, b: 0, ta: [0, -ky], tb: [-kx, 0] },
    ];

    return { vertices, segments };
  }

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

    return polygon(pts);
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

    return polygon(pts);
  }
}
