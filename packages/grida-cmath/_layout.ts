import assert from "assert";
import cmath from "./index";

export namespace layout {
  export namespace flex {
    type Axis = "horizontal" | "vertical";
    type MainAxisAlignment = "start" | "end" | "center";
    type CrossAxisAlignment = "start" | "end" | "center";

    interface Guessed {
      orders: number[];
      direction: Axis;
      mainAxisAlignment: MainAxisAlignment;
      crossAxisAlignment: CrossAxisAlignment;
      spacing: number;
    }

    function guessCrossAlignment(
      rects: cmath.Rectangle[],
      cross: cmath.Axis
    ): CrossAxisAlignment {
      // For cross-axis "x", we check x, x+width/2, x+width
      // For cross-axis "y", we check y, y+height/2, y+height
      const starts = rects.map((r) => (cross === "x" ? r.x : r.y));
      const centers = rects.map((r) =>
        cross === "x" ? r.x + r.width / 2 : r.y + r.height / 2
      );
      const ends = rects.map((r) =>
        cross === "x" ? r.x + r.width : r.y + r.height
      );

      // measure stdev for each set
      const stdev = (vals: number[]): number => {
        if (vals.length < 2) return 0;
        const m = cmath.mean(...vals);
        const variance =
          vals.reduce((acc, v) => acc + (v - m) ** 2, 0) / vals.length;
        return Math.sqrt(variance);
      };

      const sdStart = stdev(starts);
      const sdCenter = stdev(centers);
      const sdEnd = stdev(ends);

      // pick the smallest stdev
      const min = Math.min(sdStart, sdCenter, sdEnd);
      if (min === sdStart) return "start";
      if (min === sdCenter) return "center";
      return "end";
    }

    /**
     * Enhanced auto-layout guess:
     * 1. Compare total distribution (sum of gaps) along x vs y => pick main axis.
     * 2. If near tie, fallback to bounding-box dimension => pick main axis.
     * 3. Compute spacing by average gap (clamped ≥ 0).
     * 4. Sort order along chosen axis => produce `orders`.
     * 5. Guess cross-axis alignment => "start" | "center" | "end".
     */
    export function guess(boundingboxes: cmath.Rectangle[]): Guessed & {
      union: cmath.Rectangle;
    } {
      assert(
        boundingboxes.length > 0,
        "At least one bounding box is required."
      );
      const unioned = cmath.rect.union(boundingboxes);
      const width = unioned.width;
      const height = unioned.height;

      // 1) sum gaps along x / y
      const xGaps = cmath.rect.getGaps(boundingboxes, "x");
      const yGaps = cmath.rect.getGaps(boundingboxes, "y");
      const totalXGap = xGaps.reduce((acc: number, g: number) => acc + g, 0);
      const totalYGap = yGaps.reduce((acc: number, g: number) => acc + g, 0);

      // 2) pick main axis
      let axis: cmath.Axis;
      if (Math.abs(totalXGap - totalYGap) > 1) {
        axis = totalXGap > totalYGap ? "x" : "y";
      } else {
        axis = width >= height ? "x" : "y";
      }

      // 3) compute spacing
      const gaps = cmath.rect.getGaps(boundingboxes, axis);
      const spacing = gaps.length ? Math.max(0, cmath.mean(...gaps)) : 0;

      // 4) sort order
      const orders = boundingboxes
        .map((r, i) => ({ i, r }))
        .sort((a, b) => (axis === "x" ? a.r.x - b.r.x : a.r.y - b.r.y))
        .map((it) => it.i);

      // 5) guess cross-axis alignment
      const cross = axis === "x" ? "y" : "x";
      const crossAlign = guessCrossAlignment(boundingboxes, cross);

      return {
        union: unioned,
        direction: axis === "x" ? "horizontal" : "vertical",
        spacing,
        mainAxisAlignment: "start", // (if you want to also guess main-axis alignment, you'd do similarly)
        crossAxisAlignment: crossAlign,
        orders,
      };
    }
  }
}
