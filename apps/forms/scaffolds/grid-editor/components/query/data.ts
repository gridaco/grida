import type { SQLPredicateOperator } from "@/types";

export const supported_operators: SQLPredicateOperator[] = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
  "is",
  "in",
];

export const operator_labels: Record<
  SQLPredicateOperator,
  { symbol: string; label: string }
> = {
  eq: { symbol: "=", label: "[=] equals" },
  neq: { symbol: "<>", label: "[<>] not equal" },
  gt: { symbol: ">", label: "[>] greater than" },
  gte: { symbol: ">=", label: "[>=] greater than or equal" },
  lt: { symbol: "<", label: "[<] less than" },
  lte: { symbol: "<=", label: "[<=] less than or equal" },
  like: { symbol: "~~", label: "[~~] like operator" },
  ilike: { symbol: "~~*", label: "[~~*] ilike operator" },
  is: { symbol: "is", label: "[is] is (null, not null, true, false)" },
  in: { symbol: "in", label: "[in] one of the values" },
  //
  cs: { symbol: "@>", label: "[@>] contains" }, // Contains operator
  cd: { symbol: "<@", label: "[<@] contained by" }, // Contained by operator
  sl: { symbol: "<<", label: "[<<] strictly left of" }, // Range strictly left
  sr: { symbol: ">>", label: "[>>] strictly right of" }, // Range strictly right
  nxl: { symbol: "&<", label: "[&<] does not extend to the left of" }, // No extend left
  nxr: { symbol: "&>", label: "[&>] does not extend to the right of" }, // No extend right
  adj: { symbol: "-|-", label: "[-|-] adjacent" }, // Adjacent operator
  ov: { symbol: "&&", label: "[&&] overlaps" }, // Overlaps operator
  fts: { symbol: "@@", label: "[@@] full-text search" }, // Full-text search
  plfts: { symbol: "@@@", label: "[@@@] plain full-text search" }, // Plain full-text search
  phfts: { symbol: "@@@@", label: "[@@@@] phrase full-text search" }, // Phrase full-text search
  wfts: { symbol: "@@@@", label: "[@@@@] web search" }, // Web search
};
