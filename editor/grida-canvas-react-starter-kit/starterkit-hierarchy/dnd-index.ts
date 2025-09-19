import type { DragTarget } from "@headless-tree/core";

export type GetActualChildren = (
  parentId: string
) => readonly string[] | undefined;

export interface ResolveDropInsertionIndexOptions<T> {
  target: DragTarget<T>;
  draggedItemIds: readonly string[];
  getActualChildren: GetActualChildren;
  inversed?: boolean;
}

export function resolveDropInsertionIndex<T>({
  target,
  draggedItemIds,
  getActualChildren,
  inversed = false,
}: ResolveDropInsertionIndexOptions<T>): number | undefined {
  if (!("insertionIndex" in target)) {
    return undefined;
  }

  const actualChildren = getActualChildren(target.item.getId()) ?? [];

  if (!inversed) {
    return target.insertionIndex;
  }

  return resolveInversedDropInsertionIndex({
    actualChildren,
    insertionIndex: target.insertionIndex,
    draggedItemIds,
  });
}

interface ResolveInversedDropInsertionIndexArgs {
  actualChildren: readonly string[];
  insertionIndex: number;
  draggedItemIds: readonly string[];
}

function resolveInversedDropInsertionIndex({
  actualChildren,
  insertionIndex,
  draggedItemIds,
}: ResolveInversedDropInsertionIndexArgs): number {
  if (insertionIndex <= 0 && actualChildren.length === 0) {
    return 0;
  }

  const draggedSet = new Set(draggedItemIds);
  const filteredActual = actualChildren.filter(
    (childId) => !draggedSet.has(childId)
  );

  if (filteredActual.length === 0) {
    return 0;
  }

  const uiOrder = filteredActual.slice().reverse();
  const safeIndex = Math.max(0, insertionIndex);
  const nextUiSiblingId = uiOrder[safeIndex];

  if (!nextUiSiblingId) {
    return 0;
  }

  const siblingIndex = filteredActual.indexOf(nextUiSiblingId);
  if (siblingIndex === -1) {
    return 0;
  }

  return siblingIndex + 1;
}
