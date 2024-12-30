import { tokens } from "@/ast";
import { useFormAgentState } from "@/lib/formstate";
import assert from "assert";
import { useMemo } from "react";

/**
 * primative compute operation
 * compute condition with resolved primative values
 */
function op<T = any>(
  ...[l, o, r]:
    | tokens.ShorthandBinaryExpression<number, number>
    | tokens.ShorthandBooleanBinaryExpression<
        tokens.Primitive,
        tokens.Primitive
      >
): T | undefined {
  switch (o) {
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
    //
    case "&&":
      return (l && r) as T;
    case "||":
      return (l || r) as T;
    //
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
    //
    case "??":
      return (l ?? r) as T;
    default:
      return undefined;
  }
}

function resolveJsonRefPath(ref: tokens.JSONRef): string[] {
  // get rid of #/ prefix
  const path = ref.$ref?.startsWith("#/") ? ref.$ref.slice(2) : undefined;
  assert(path, "Invalid JSON Reference - Must start with #/");

  return path.split("/");
}

function access(
  data: any,
  exp?: tokens.TValueExpression | undefined | null
): tokens.Primitive | undefined | null {
  if (exp === undefined) return undefined;
  if (exp === null) return null;
  if (tokens.is.primitive(exp)) {
    return exp;
  }
  if (tokens.is.jsonRef(exp)) {
    const path = resolveJsonRefPath(exp);
    const value = tokens.Access.access(data, path);
    return value;
  }
  if (tokens.is.inferredShorthandBinaryExpression(exp)) {
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
  exp?: tokens.TValueExpression | undefined | null
): O | undefined {
  const [state] = useFormAgentState();
  return useMemo(() => {
    return access(state, exp) as O;
  }, [exp, state]);
}
