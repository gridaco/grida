import type { Tokens } from ".";

export namespace Factory {
  export function createStringValueExpression(
    value?: string | { type: "path"; path: string }
  ): Tokens.StringValueExpression {
    if (typeof value === "string") {
      return value;
    } else if (value?.type === "path") {
      return {
        kind: "TemplateExpression",
        templateSpans: [
          {
            kind: "PropertyPathLiteral",
            path: value.path,
          },
        ],
      } satisfies Tokens.TemplateExpression;
    }
    return "";
  }

  export function isTemplateExpression(
    value?: Tokens.StringValueExpression
  ): value is Tokens.TemplateExpression {
    return (
      typeof value === "object" &&
      "kind" in value &&
      value.kind === "TemplateExpression"
    );
  }
}
