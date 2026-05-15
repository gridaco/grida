// Ephemeral derivation script for HUD perimeter geometry + priority.
//
// Model:
//   The 8 outer slices (4 corners + 4 edges) tile the perimeter ring
//   around the bbox as a strict 3×3 partition — mutually exclusive.
//   The body is a 9th slice (rect_screen). Two mechanisms layered:
//
//   1) Per-axis negotiation decides the corner / edge / corner split
//      along each axis. Side (edge) is higher-priority — guarantees
//      its `MIN_GUARANTEED_DIM` of length first; corners take the
//      remainder and shrink when constrained.
//
//   2) Priority field on each zone (`lower wins`) resolves the one
//      overlap geometry can't avoid: body straddles into the perimeter
//      ring's inside-bbox half in comfortable mode. Body promotes
//      above corner when any axis is shorter than the derived
//      threshold; edge promotes above body in their interior overlap
//      when its parallel axis is short.
//
// Principle (one tunable):
//   MIN_GUARANTEED_DIM — the minimum length we guarantee for:
//     - each side strip along its parallel axis (negotiation min)
//     - the body interior on each axis (priority promotion trigger)
//
// Run:  node packages/grida-canvas-hud/__bench__/derive-thresholds.mjs

const HIT_SIZE = 16; // current MIN_HIT_SIZE — corner preferred length
const MIN_GUARANTEED_DIM = 20; // tunable

// Derived
const EXTENSION = HIT_SIZE / 2; // perimeter overhang outside bbox per side
const BODY_FLIP_THRESHOLD = MIN_GUARANTEED_DIM + HIT_SIZE; // 36

console.log("HUD geometry + priority derivation");
console.log("──────────────────────────────────");
console.log(`HIT_SIZE              = ${HIT_SIZE}`);
console.log(`MIN_GUARANTEED_DIM    = ${MIN_GUARANTEED_DIM}`);
console.log(`EXTENSION             = ${EXTENSION}  (= HIT_SIZE / 2)`);
console.log(`BODY_FLIP_THRESHOLD   = ${BODY_FLIP_THRESHOLD}  (= dim + hit)`);
console.log("");

// 1D negotiation. Same function as the runtime.
function negotiateAxis(total, corner_preferred, edge_min) {
  if (total <= 0) return { corner: 0, edge: 0 };
  if (total >= corner_preferred * 2 + edge_min) {
    return { corner: corner_preferred, edge: total - corner_preferred * 2 };
  }
  if (total >= edge_min) {
    return { corner: (total - edge_min) / 2, edge: edge_min };
  }
  return { corner: 0, edge: total };
}

// ── Scenario probes ────────────────────────────────────────────────────────

const scenarios = [
  { name: "user example  ( 20 × 100)", w: 20, h: 100 },
  { name: "tiny square   (  8 ×   8)", w: 8, h: 8 },
  { name: "small square  ( 20 ×  20)", w: 20, h: 20 },
  { name: "mid square    ( 30 ×  30)", w: 30, h: 30 },
  { name: "fence square  ( 36 ×  36)", w: 36, h: 36 },
  { name: "comfortable   ( 50 ×  50)", w: 50, h: 50 },
  { name: "wide strip    (200 ×  20)", w: 200, h: 20 },
  { name: "tall strip    ( 20 × 500)", w: 20, h: 500 },
];

function phase(total) {
  if (total >= HIT_SIZE * 2 + MIN_GUARANTEED_DIM) return "comfortable";
  if (total >= MIN_GUARANTEED_DIM) return "squeezed   ";
  return "tiny       ";
}

for (const s of scenarios) {
  const total_x = s.w + EXTENSION * 2;
  const total_y = s.h + EXTENSION * 2;
  const { corner: cx, edge: ex } = negotiateAxis(total_x, HIT_SIZE, MIN_GUARANTEED_DIM);
  const { corner: cy, edge: ey } = negotiateAxis(total_y, HIT_SIZE, MIN_GUARANTEED_DIM);
  const w_violated = s.w < BODY_FLIP_THRESHOLD;
  const h_violated = s.h < BODY_FLIP_THRESHOLD;
  const small_mode = w_violated || h_violated;

  console.log(`${s.name}`);
  console.log(
    `  top axis: total=${total_x}  phase=${phase(total_x)}  → corner cx=${cx}  edge ex=${ex}`
  );
  console.log(
    `  left axis: total=${total_y} phase=${phase(total_y)}  → corner cy=${cy}  edge ey=${ey}`
  );
  console.log(
    `  NW corner rect: ${cx} × ${cy}  (each corner; sides share these dims)`
  );
  console.log(
    `  body promotion: w_viol=${pad(w_violated)} h_viol=${pad(h_violated)} → ${small_mode ? "BODY promoted ↑ over corner" : "body default (corner wins overlap)"}`
  );
  console.log("");
}

function pad(b) {
  return b ? "YES" : "no ";
}

// ── Conclusion ────────────────────────────────────────────────────────────

console.log("Priority ladder (lower wins):");
console.log("  ENDPOINT(10) < ROTATE(20) < EDGE_SMALL(22) < BODY_SMALL(25)");
console.log("         < EDGE(30) < CORNER(31) < BODY(40)");
console.log("");
console.log("Negotiation phases (per axis):");
console.log(`  comfortable: total ≥ ${HIT_SIZE * 2 + MIN_GUARANTEED_DIM}  → corner=${HIT_SIZE}, edge=total-${HIT_SIZE * 2}`);
console.log(`  squeezed:    total ≥ ${MIN_GUARANTEED_DIM}                 → edge=${MIN_GUARANTEED_DIM} (min), corner=(total-${MIN_GUARANTEED_DIM})/2`);
console.log(`  tiny:        else                                          → edge=total, corner=0`);
console.log("");
console.log("MIN_GUARANTEED_DIM is the single tunable; everything else derives.");
