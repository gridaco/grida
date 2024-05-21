import type { JSONBooleanValueDescriptor } from "@/types/logic";

export function LogicalProvider() {
  return;
}

/**
 * returns a computed value based on the descriptor
 * (currently only supports boolean values)
 * @param descriptor
 * @returns
 */
export function useLogical(
  descriptor?: JSONBooleanValueDescriptor | undefined | null
) {
  if (descriptor === undefined || descriptor === null) {
    return false;
  }

  // TODO:
  return false;
}

function useReference() {
  return;
}

function useReferencedValue() {
  return;
}
