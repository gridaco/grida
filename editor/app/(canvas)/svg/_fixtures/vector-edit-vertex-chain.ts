/**
 * Fixture for exercising v1 vector-edit on the vertex-chain tags
 * `<polyline>` and `<polygon>`. Each shape sits in its own horizontal
 * lane (~200px tall) with high-contrast strokes so vertex knobs are
 * easy to pick.
 *
 * `<line>` is kept in the fixture for selection / resize coverage but
 * is intentionally NOT a vector-edit target in v1: a line has no in-tag
 * vertex-edit gestures (insert-vertex would promote to <polyline>,
 * tangent would promote to <path>), and promotion is out of scope. The
 * editor will refuse the dblclick / Enter intent on it.
 *
 * Verification steps this fixture supports:
 *   1. Single-click a shape → selection chrome (all three lanes).
 *   2. Double-click (or Enter) a `<polyline>` or `<polygon>` →
 *      vector-edit mode; vertex knobs appear. Double-click on `<line>`
 *      does NOT enter vector-edit.
 *   3. Drag a vertex knob → element stays the same tag, only `points=`
 *      changes in a diff. The `<svg>` source serialise shows ONE attr's
 *      worth of change per gesture. Tangent handles are NOT rendered in
 *      v1 for these tags (curve edits would force promotion to <path>).
 *   4. Press Esc with no gesture → byte-equal output (revert if no
 *      changes made).
 */
export default `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
  <line x1="80" y1="100" x2="720" y2="100" stroke="#ef4444" stroke-width="3"/>
  <polyline points="80,260 240,200 400,300 560,220 720,260" fill="none" stroke="#3b82f6" stroke-width="3"/>
  <polygon points="120,520 240,400 400,460 560,400 680,520 400,580" fill="#10b98133" stroke="#10b981" stroke-width="3"/>
</svg>`;
