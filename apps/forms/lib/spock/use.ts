import { Access, Tokens } from "@/ast";
import { useFormAgentState } from "@/lib/formstate";
import assert from "assert";
import { useMemo } from "react";

/**
 * primative compute operation
 * compute condition with resolved primative values
 */
function op<T>(
  ...[l, o, r]:
    | Tokens.ShorthandConditionExpression<Tokens.Primitive, Tokens.Primitive>
    | Tokens.ShorthandBinaryExpression<number, number>
): T | undefined {
  switch (o) {
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

function resolveJsonRefPath(ref: Tokens.JSONRef): string[] {
  // get rid of #/ prefix
  const path = ref.$ref?.startsWith("#/") ? ref.$ref.slice(2) : undefined;
  assert(path, "Invalid JSON Reference - Must start with #/");

  return path.split("/");
}

function access(
  data: any,
  exp?: Tokens.TValueExpression | undefined | null
): Tokens.Primitive | undefined {
  if (!exp) return undefined;
  if (Tokens.is.primitive(exp)) {
    return exp;
  }
  if (Tokens.is.jsonRef(exp)) {
    const path = resolveJsonRefPath(exp);
    const value = Access.access(data, path);
    return value;
  }
  if (Tokens.is.inferredShorthandOperationExpression(exp)) {
    const [l, o, r] = exp;

    const left: any = access(data, l);
    const right: any = access(data, r);
    return op(left, o!, right);
  }

  // unhandled expression
  console.error("unhandled expression", exp);

  return undefined;
}

/**
 * @beta TODO: Limited usage
 * @param exp
 * @returns
 */
export function useValue<O>(
  exp?: Tokens.TValueExpression | undefined | null
): O | undefined {
  const [state] = useFormAgentState();
  return useMemo(() => {
    return access(state, exp) as O;
  }, [exp, state]);
}
