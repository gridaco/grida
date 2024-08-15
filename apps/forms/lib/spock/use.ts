import { Tokens } from "@/ast";
import { useFormAgentState } from "@/lib/formstate";
import { useMemo } from "react";

export function useReference(ref?: Tokens.JSONRef | Tokens.Primitive) {
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

const parseReference = (ref?: Tokens.JSONRef | Tokens.Primitive | null) => {
  const [_, def, key, ...access] =
    typeof ref === "object" ? ref?.$ref?.split("/") ?? [] : [];
  return { def: def as "fields" | undefined, key, access };
};

/**
 * compute condition with resolved primative values
 */
function pcomputeop<T>(
  ...[l, op, r]:
    | Tokens.ShorthandConditionExpression<Tokens.Primitive, Tokens.Primitive>
    | Tokens.ShorthandBinaryExpression<number, number>
): T | undefined {
  switch (op) {
    // condition operators
    case "==":
      return (l === r) as T;
    case "!=":
      return (l !== r) as T;
    case ">":
      return (l > r) as T;
    case "<":
      return (l < r) as T;
    case ">=":
      return (l >= r) as T;
    case "<=":
      return (l <= r) as T;
    // binary operators
    case "+":
      return (l + r) as T;
    case "-":
      return (l - r) as T;
    case "*":
      return (l * r) as T;
    case "/":
      return (l / r) as T;
    case "%":
      return (l % r) as T;
    default:
      return undefined;
  }
}

export function useValue<O>(
  exp?: Tokens.TValueExpression | undefined | null
): O | undefined {
  const [l, op, r] = Array.isArray(exp) ? exp : [];

  const left = useReference(l);
  const right = useReference(r);

  if (!exp) return;
  if (!Tokens.is.inferredShorthandOperationExpression(exp)) return;

  return pcomputeop(left, op!, right);
}

/**
 * returns a computed value based on the descriptor
 * (currently only supports boolean values)
 * @param exp
 * @returns
 */
export function useLogical(
  exp?: Tokens.BooleanValueExpression | undefined | null
): boolean | undefined {
  return useValue<boolean>(exp);
}
