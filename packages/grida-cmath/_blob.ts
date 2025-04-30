// https://github.com/lokesh-coder/blobshape / MIT License

/** -------------------------------------------------------------
 * Random-radial Bézier blob generator
 * -------------------------------------------------------------
 */
export namespace blob {
  /**
   * Parameters for the blob generator.
   * `size` is the full SVG view-box width/height.
   */
  export interface BlobParams {
    size?: number; // default = 400
    growth?: number; // min radius factor (0–10), default = 6
    edges?: number; // how many “spikes”, default = 6
    seed?: number | null;
  }

  /** Return value: SVG path + the seed actually used */
  export interface BlobResult {
    path: string;
    seedValue: number;
  }

  /* ---------- Public API -------------------------------------------------- */
  export function generator({
    size = 400,
    growth = 6,
    edges = 6,
    seed = null,
  }: BlobParams = {}): BlobResult {
    const { destPoints, seedValue } = createPoints(size, growth, edges, seed);
    const path = createSvgPath(destPoints);
    return { path, seedValue };
  }

  /* ---------- Helpers ----------------------------------------------------- */

  const toRad = (deg: number): number => deg * (Math.PI / 180);

  /** Split the circle into `count` equal angles (degrees). */
  const divide = (count: number): number[] => {
    const inc = 360 / count;
    return Array.from({ length: count }, (_, i) => i * inc);
  };

  /** Deterministic 32-bit Xorshift PRNG → double in [0,1). */
  const randomDoubleGenerator = (s: number) => {
    const mask = 0xffffffff;
    let m_w = (123456789 + s) & mask;
    let m_z = (987654321 - s) & mask;

    return () => {
      m_z = (36969 * (m_z & 65535) + (m_z >>> 16)) & mask;
      m_w = (18000 * (m_w & 65535) + (m_w >>> 16)) & mask;
      let result = ((m_z << 16) + (m_w & 65535)) >>> 0;
      result /= 4294967296;
      return result;
    };
  };

  /** Clamp-with-wrap so value always lands in `[min,max]`. */
  const magicPoint = (v: number, min: number, max: number): number => {
    let radius = min + v * (max - min);
    if (radius > max) radius -= min;
    else if (radius < min) radius += min;
    return radius;
  };

  /** Polar → Cartesian (rounded ints). */
  const polarPoint = (
    origin: number,
    r: number,
    deg: number
  ): [number, number] => [
    Math.round(origin + r * Math.cos(toRad(deg))),
    Math.round(origin + r * Math.sin(toRad(deg))),
  ];

  /** Silly one-liner shuffle (OK here; not crypto-secure). */
  const shuffle = <T>(arr: T[]): T[] => {
    // @ts-ignore – `sort` with random comparator is intentional
    return arr.sort(() => Math.random() - 0.5);
  };

  /* ---------- Core point generator --------------------------------------- */
  const createPoints = (
    size: number,
    minGrowth: number,
    edgesCount: number,
    seed: number | null
  ) => {
    const outerRad = size / 2;
    const innerRad = minGrowth * (outerRad / 10);
    const center = size / 2;

    const slices = divide(edgesCount);
    const maxRandomValue = shuffle([99, 999, 9_999, 99_999, 999_999])[0];
    const id = Math.floor(Math.random() * maxRandomValue);
    const seedValue = seed ?? id;
    const rand = randomDoubleGenerator(seedValue);

    const destPoints: [number, number][] = slices.map((deg) => {
      const radius = magicPoint(rand(), innerRad, outerRad);
      return polarPoint(center, radius, deg);
    });

    return { destPoints, seedValue };
  };

  /* ---------- Quadratic-Bézier path builder ------------------------------ */
  const createSvgPath = (pts: [number, number][]): string => {
    if (pts.length < 2) return "";

    let svg = "";
    let mid: [number, number] = [
      (pts[0][0] + pts[1][0]) / 2,
      (pts[0][1] + pts[1][1]) / 2,
    ];
    svg += `M${mid[0]},${mid[1]}`;

    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[(i + 1) % pts.length];
      const p2 = pts[(i + 2) % pts.length];
      mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
      svg += `Q${p1[0]},${p1[1]},${mid[0]},${mid[1]}`;
    }
    return svg + "Z";
  };
}
