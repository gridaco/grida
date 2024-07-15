import type { Tokens } from "@/types/ast";
import { useFormAgentState } from "@/lib/formstate";
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
  descriptor?: Tokens.BooleanValueExpression | undefined | null
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

export function useReference(
  ref?: Tokens.JSONFieldReference | Tokens.Primitive
) {
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

const parseReference = (
  ref?: Tokens.JSONFieldReference | Tokens.Primitive | null
) => {
  const [_, def, key, ...access] =
    typeof ref === "object" ? ref?.$ref?.split("/") ?? [] : [];
  return { def: def as "fields" | undefined, key, access };
};
