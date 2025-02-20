import type { XYWH } from "../types";

/**
 * Checks if two items overlap.
 */
function doesOverlap(a: XYWH, b: XYWH, padding: number = 0): boolean {
  // Expand `a` by `padding` on all sides
  const expandedA: XYWH = [
    a[0] - padding,
    a[1] - padding,
    a[2] + padding * 2,
    a[3] + padding * 2,
  ];

  // Check for overlap
  return (
    expandedA[0] < b[0] + b[2] &&
    expandedA[0] + expandedA[2] > b[0] &&
    expandedA[1] < b[1] + b[3] &&
    expandedA[1] + expandedA[3] > b[1]
  );
}

/**
 * Finds a new placement for an item without overlapping existing items.
 */
export function no_overlap_placement(
  newItem: XYWH,
  items: XYWH[],
  options?: {
    padding?: number;
  }
): XYWH | null {
  const padding = options?.padding ?? 0;

  // Start searching from the top-left corner of the canvas.
  // Incrementally move to the right and down until a non-overlapping position is found.
  let candidateX = 0;
  let candidateY = 0;

  let found = false;
  while (!found) {
    found = true; // Assume a position is found until proven otherwise

    // Define the candidate position for the new item
    const candidateItem: XYWH = [
      candidateX,
      candidateY,
      newItem[2],
      newItem[3],
    ];

    // Check against all existing items for overlaps
    for (const existingItem of items) {
      if (doesOverlap(candidateItem, existingItem, padding)) {
        found = false;
        break; // Overlap found, break and try next position
      }
    }

    if (found) {
      // If no overlap, return this position
      return [candidateX, candidateY, newItem[2], newItem[3]];
    } else {
      // Adjust candidate position and try again
      candidateX += 10; // Increment X-axis

      // If reaches a certain limit, reset X and increment Y
      // This limit can be adjusted based on canvas size or requirements
      if (candidateX > 1000) {
        // Assuming 1000 is the width limit for the canvas
        candidateX = 0;
        candidateY += 10; // Increment Y-axis
      }

      // Optional: add a condition to stop searching after a certain limit
      // to prevent infinite loops in cases where no space is available.
    }
  }

  // If no position is found (e.g., after reaching a limit), return null or an appropriate response
  return null;
}
