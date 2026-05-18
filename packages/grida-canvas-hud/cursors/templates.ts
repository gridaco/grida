/**
 * SVG cursor templates — pure string templates parameterized by angle.
 *
 * Two families:
 *
 * 1. **Rotate arrow** — a curved double-arrow. Built from one template
 *    (`template_rotate`) rotated by `angle_deg` around the SVG's
 *    hotspot. Per-corner orientation comes from caller-supplied
 *    initial offsets (NW: −45°, NE: +45°, SW: −135°, SE: +135°), in
 *    Phase A. In Phase B, the host's selection rotation is added on
 *    top of that.
 *
 * 2. **Resize arrow** — a straight double-arrow, also built from one
 *    template (`template_resize`) rotated per cardinal direction. The
 *    8 standard directions (N/NE/E/SE/S/SW/W/NW) map to multiples of
 *    45° from the canonical horizontal arrow.
 *
 * **Fixed Grida palette** — black fill, white stroke. Cursors are not
 * color-themed; hosts wanting custom colors install a custom
 * `CursorRenderer` (see `renderer.ts`).
 *
 * **Hotspots** are documented per template — the click point inside
 * the SVG that the OS aligns with the actual pointer position. Hotspots
 * are fixed (SVG center) because the SVG rotates around the same point;
 * the cursor stays anchored to the pointer regardless of angle.
 */

// ────────────────────────────────────────────────────────────────────────────
// Rotate arrow — curved double-arrow, lifted from the main editor's
// `cursor-data.ts:template_rotate_svg` so visuals are byte-identical when
// we later A/B-compare during the main-editor migration.
//
// SVG dimensions: 26×24. Hotspot: (12, 12). The SVG itself applies
// `rotate(${angle}, 13, 12)` to the path; the hotspot is chosen as
// (12, 12) — close enough to the rotation pivot that rounding error
// doesn't visibly shift the cursor as the angle changes.
// ────────────────────────────────────────────────────────────────────────────

/** Rotate cursor SVG. `angle_deg` rotates the arrow around (13, 12). */
export function template_rotate(angle_deg: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="24" fill="none">` +
    `<g filter="url(#a)" transform="rotate(${angle_deg}, 13, 12), scale(0.75)">` +
    `<path fill="#000" fill-rule="evenodd" d="M23 15.5h-6.43l2.65-2.79A7.72 7.72 0 0 0 13 9.5a7.72 7.72 0 0 0-6.22 3.21l2.65 2.79H3V8.75l1.74 1.83A10.5 10.5 0 0 1 13 6.5c3.32 0 6.3 1.59 8.26 4.08L23 8.75v6.75Z" clip-rule="evenodd"/>` +
    `<path stroke="#fff" stroke-width=".75" d="M23 15.88h.38V7.8l-.65.68-1.45 1.52A10.85 10.85 0 0 0 13 6.13c-3.3 0-6.25 1.5-8.28 3.88L3.27 8.5l-.64-.68v8.07h7.67l-.6-.64-2.43-2.55A7.32 7.32 0 0 1 13 9.88c2.3 0 4.36 1.08 5.73 2.8l-2.43 2.56-.6.63H23Z"/>` +
    `</g>` +
    `<defs>` +
    `<filter id="a" width="25.1" height="14.1" x=".45" y="4.95" color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse">` +
    `<feFlood flood-opacity="0" result="BackgroundImageFix"/>` +
    `<feColorMatrix in="SourceAlpha" result="hardAlpha" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"/>` +
    `<feOffset dy="1"/>` +
    `<feGaussianBlur stdDeviation=".9"/>` +
    `<feComposite in2="hardAlpha" operator="out"/>` +
    `<feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.65 0"/>` +
    `<feBlend in2="BackgroundImageFix" result="effect1_dropShadow_443_204"/>` +
    `<feBlend in="SourceGraphic" in2="effect1_dropShadow_443_204" result="shape"/>` +
    `</filter>` +
    `</defs>` +
    `</svg>`
  );
}

/** Hotspot for `template_rotate` — CSS-px offset from SVG top-left. */
export const ROTATE_HOTSPOT: readonly [number, number] = [12, 12];

// ────────────────────────────────────────────────────────────────────────────
// Resize arrow — straight double-arrow rotated per cardinal direction.
//
// The canonical orientation is **horizontal** (E ↔ W double-arrow). The
// template rotates by `angle_deg` around the SVG center (16, 16) to
// produce any of the 8 cardinal/diagonal directions.
//
// SVG dimensions: 32×32. Hotspot: (16, 16) — dead center. The SVG is
// symmetric across both axes through the center, so the hotspot is
// stable under rotation.
//
// The arrow itself is two filled triangles connected by a 2-px-wide
// stalk. Compact (~300 B unrotated), legible at 16-CSS-px display size
// across DPR 1–2.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Resize cursor SVG. `angle_deg` rotates the arrow around (16, 16).
 *
 * For the canonical horizontal arrow pass `0`. For the 8 standard
 * cardinal directions, see `DIRECTION_ANGLE_DEG` in `renderer.ts`.
 */
export function template_resize(angle_deg: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none">` +
    `<g filter="url(#b)" transform="rotate(${angle_deg}, 16, 16)">` +
    // Arrow path: two triangles (left & right tip) + connecting stalk.
    // Centered on (16, 16). Total span = 18 px from tip to tip.
    `<path fill="#000" stroke="#fff" stroke-width="1" stroke-linejoin="round" d="M7 16 L11 12 L11 14.5 L21 14.5 L21 12 L25 16 L21 20 L21 17.5 L11 17.5 L11 20 Z"/>` +
    `</g>` +
    `<defs>` +
    `<filter id="b" width="22" height="13" x="5" y="10" color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse">` +
    `<feFlood flood-opacity="0" result="BackgroundImageFix"/>` +
    `<feColorMatrix in="SourceAlpha" result="hardAlpha" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"/>` +
    `<feOffset dy="1"/>` +
    `<feGaussianBlur stdDeviation=".8"/>` +
    `<feComposite in2="hardAlpha" operator="out"/>` +
    `<feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.55 0"/>` +
    `<feBlend in2="BackgroundImageFix" result="effect1_dropShadow_resize"/>` +
    `<feBlend in="SourceGraphic" in2="effect1_dropShadow_resize" result="shape"/>` +
    `</filter>` +
    `</defs>` +
    `</svg>`
  );
}

/** Hotspot for `template_resize` — CSS-px offset from SVG top-left. */
export const RESIZE_HOTSPOT: readonly [number, number] = [16, 16];
