/**
 * Minimal fixture for isolating snap behavior. Two rects of equal size
 * on a non-full-bleed canvas — no background rect, no parent that
 * shares the agent's bounds, no overlapping geometry. Whatever snap
 * behavior shows up here is purely between the two rects and the SVG
 * root, with everything pixel-aligned to integers.
 *
 * Coordinates chosen so:
 *   - Same y (top=80), same height (60) → top / middle / bottom
 *     y-edges line up exactly across both rects.
 *   - x positions 60 and 220, width 60 → right edge of A = 120,
 *     left edge of B = 220. Gap 100 between A's right and B's left.
 *     Center-to-center distance 160.
 *   - viewBox 400×240 → SVG root and the two rects do NOT share any
 *     bounding-box edge (so the Q1 self-bound-parent bug is out of
 *     the picture).
 */
export default `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="400" height="240">
  <rect x="60" y="80" width="60" height="60" fill="#ef4444"/>
  <rect x="220" y="80" width="60" height="60" fill="#3b82f6"/>
</svg>`;
