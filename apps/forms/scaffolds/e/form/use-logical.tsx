import type {
  JSONBooleanValueDescriptor,
  JSONConditionExpression,
  JSONFieldReference,
  Scalar,
} from "@/types/logic";
import { useFormAgentState } from "./core/provider";
import { useMemo } from "react";

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
  const [l, op, r] = Array.isArray(descriptor) ? descriptor : [];

  const left = useReference(l);
  const right = useReference(r);

  if ([left, right, op].every((v) => v === undefined)) {
    return undefined;
  }

  switch (op) {
    case "==":
      return left === right;
    case "!=":
      return left !== right;
    case ">":
      return left > right;
    case "<":
      return left < right;
    case ">=":
      return left >= right;
    case "<=":
      return left <= right;
    default:
      return undefined;
  }
}

export function useReference(ref?: JSONFieldReference | Scalar) {
  const [state] = useFormAgentState();

  const scalar = typeof ref !== "object" ? ref : null;
  const { def, key, access } = parseReference(ref);

  // @ts-ignore
  const entity = state?.[def]?.[key];

  const value = useMemo(() => {
    if (!entity) {
      return;
    }

    const value = access.reduce((acc: any, key: string) => {
      if (acc === undefined) {
        return acc;
      }

      // @ts-ignore
      return acc?.[key] as string | boolean | undefined;
    }, entity);

    return value;
  }, [access, entity]);

  return scalar || value;
}

const parseReference = (ref?: JSONFieldReference | Scalar | null) => {
  const [_, def, key, ...access] =
    typeof ref === "object" ? ref?.$ref?.split("/") ?? [] : [];
  return { def: def as "fields" | undefined, key, access };
};
