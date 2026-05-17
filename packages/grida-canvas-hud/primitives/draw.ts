import type { HUDDraw, HUDSemantic, HUDSemanticGroup } from "./types";

export interface HUDGroupFilter {
  hidden?: Iterable<HUDSemanticGroup>;
}

/**
 * Filter a draw command list by semantic group.
 *
 * Ungrouped primitives are always kept. The function is intentionally shallow:
 * primitives are immutable command objects on the hot draw path, so preserving
 * object identity keeps this as a visibility pass rather than a rewrite.
 */
export function filterHUDDrawByGroup(
  draw: HUDDraw | undefined,
  filter: HUDGroupFilter
): HUDDraw | undefined {
  if (!draw) return undefined;
  const hidden = new Set(filter.hidden ?? []);
  if (hidden.size === 0) return draw;

  const out: HUDDraw = {};
  out.lines = keepVisible(draw.lines, hidden);
  out.rules = keepVisible(draw.rules, hidden);
  out.points = keepVisible(draw.points, hidden);
  out.rects = keepVisible(draw.rects, hidden);
  out.polylines = keepVisible(draw.polylines, hidden);
  out.screenRects = keepVisible(draw.screenRects, hidden);

  return hasAny(out) ? out : undefined;
}

function keepVisible<T extends HUDSemantic>(
  items: T[] | undefined,
  hidden: ReadonlySet<HUDSemanticGroup>
): T[] | undefined {
  if (!items || items.length === 0) return undefined;
  const kept = items.filter((item) => !item.group || !hidden.has(item.group));
  return kept.length > 0 ? kept : undefined;
}

function hasAny(draw: HUDDraw): boolean {
  return (
    (draw.lines?.length ?? 0) > 0 ||
    (draw.rules?.length ?? 0) > 0 ||
    (draw.points?.length ?? 0) > 0 ||
    (draw.rects?.length ?? 0) > 0 ||
    (draw.polylines?.length ?? 0) > 0 ||
    (draw.screenRects?.length ?? 0) > 0
  );
}
