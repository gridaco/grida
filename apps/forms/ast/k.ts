import type { Tokens } from "./tokens";

export const binary_operator_labels: Record<
  Tokens.BinaryOperator,
  [string, string]
> = {
  "==": ["is", "equal to"],
  "!=": ["is not", "not equal to"],
  ">": ["gt", "greater than"],
  "<": ["lt", "less than"],
  ">=": ["gte", "greater than or equal to"],
  "<=": ["lte", "less than or equal to"],
  "&&": ["and", "and"],
  "||": ["or", "or"],
  "+": ["plus", "added to"],
  "-": ["minus", "subtracted by"],
  "*": ["times", "multiplied by"],
  "/": ["divided", "divided by"],
  "%": ["mod", "modulus of"],
  "??": ["nullish coalescing", "or default to"],
};
