import cg from "@grida/cg";
import assert from "assert";
import type grida from "@grida/schema";

/**
 * Resolves paint arrays and indices for a given node and target
 *
 * @param node - The node containing paint properties (supports all node types and Immer drafts)
 * @param target - Whether to target "fill" or "stroke" paints
 * @param paintIndex - The desired paint index (defaults to 0)
 * @returns Object containing resolved paints array and valid index
 */
export function resolvePaints(
  node: grida.program.nodes.UnknwonNode,
  target: "fill" | "stroke",
  paintIndex: number = 0
): { paints: cg.Paint[]; resolvedIndex: number } {
  // Validate inputs
  assert(node, "resolvePaints: node is required");
  assert(
    ["fill", "stroke"].includes(target),
    `Invalid paint_target: ${target}. Must be "fill" or "stroke".`
  );
  assert(
    typeof paintIndex === "number" && paintIndex >= 0,
    `Invalid paint_index: ${paintIndex}. Must be a non-negative number.`
  );

  const pluralKey = target === "stroke" ? "stroke_paints" : "fill_paints";
  const singularKey = target === "stroke" ? "stroke" : "fill";

  // Get paints array, handling both legacy and new paint models

  const paints = Array.isArray(node[pluralKey])
    ? (node[pluralKey] as cg.Paint[])
    : node[singularKey]
      ? [node[singularKey] as cg.Paint]
      : [];

  // Resolve index with bounds checking
  const resolvedIndex =
    paints.length > 0
      ? Math.min(Math.max(0, paintIndex), paints.length - 1)
      : 0;

  return { paints, resolvedIndex };
}

/**
 * Gets the target paint from a node with proper bounds checking
 *
 * @param node - The node containing paint properties (supports all node types and Immer drafts)
 * @param target - Whether to target "fill" or "stroke" paints
 * @param paintIndex - The desired paint index (defaults to 0)
 * @returns The target paint or undefined if not found
 */
export function getTargetPaint(
  node: grida.program.nodes.UnknwonNode,
  target: "fill" | "stroke",
  paintIndex: number = 0
): cg.Paint | undefined {
  const { paints, resolvedIndex } = resolvePaints(node, target, paintIndex);
  return paints[resolvedIndex];
}

/**
 * Updates a target paint in a node
 *
 * @param node - The node to update (supports all node types and Immer drafts)
 * @param target - Whether to target "fill" or "stroke" paints
 * @param paintIndex - The paint index to update
 * @param newPaint - The new paint value
 */
export function updateTargetPaint(
  node: grida.program.nodes.UnknwonNode,
  target: "fill" | "stroke",
  paintIndex: number,
  newPaint: cg.Paint
): void {
  assert(node, "updateTargetPaint: node is required");
  assert(newPaint, "updateTargetPaint: newPaint is required");

  const { paints, resolvedIndex } = resolvePaints(node, target, paintIndex);

  if (paints.length === 0) {
    // Add first paint
    paints.push(newPaint);
  } else {
    // Update existing paint
    paints[resolvedIndex] = newPaint;
  }

  // Update the singular property for legacy compatibility
  const singularKey = target === "stroke" ? "stroke" : "fill";
  node[singularKey] = paints[0];
}
