import { DEFAULT_GAP_ALIGNMENT_TOLERANCE } from "@/grida-react-canvas/state";
import { cmath } from "@grida/cmath";

export interface AxisAlignedObjectsDistribution {
  /**
   * tolerance for alignment - used for deciding uniform gap
   */
  tolerance: number;

  /**
   * uniform gap between objects
   */
  gap: number | undefined;

  /**
   * gaps between objects, as-is
   */
  gaps: number[];
}

export interface ObjectsDistributionAnalysis {
  rects: cmath.Rectangle[];
  x: AxisAlignedObjectsDistribution | undefined;
  y: AxisAlignedObjectsDistribution | undefined;
}

export function analyzeDistribution(
  rects: cmath.Rectangle[]
): ObjectsDistributionAnalysis {
  if (rects.length > 1) {
    const x_distribute = cmath.rect.axisProjectionIntersection(rects, "x");
    const y_distribute = cmath.rect.axisProjectionIntersection(rects, "y");
    let x: AxisAlignedObjectsDistribution | undefined = undefined;
    let y: AxisAlignedObjectsDistribution | undefined = undefined;
    if (x_distribute) {
      const [gap, gaps] = cmath.rect.getUniformGap(
        rects,
        "x",
        DEFAULT_GAP_ALIGNMENT_TOLERANCE
      );
      x = {
        gap,
        gaps,
        tolerance: DEFAULT_GAP_ALIGNMENT_TOLERANCE,
      };
    }

    if (y_distribute) {
      const [gap, gaps] = cmath.rect.getUniformGap(
        rects,
        "y",
        DEFAULT_GAP_ALIGNMENT_TOLERANCE
      );
      y = {
        gap,
        gaps: gaps,
        tolerance: DEFAULT_GAP_ALIGNMENT_TOLERANCE,
      };
    }

    return {
      rects,
      x,
      y,
    };
  }

  return { rects, x: undefined, y: undefined };
}
