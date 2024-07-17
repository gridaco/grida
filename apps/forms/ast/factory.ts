import { Access } from "./access";
import type { Tokens } from "./tokens";

export namespace Factory {
  export function createStringValueExpression(
    value?: string | { type: "path"; path: Array<string> }
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

  /**
   *
   * Extracts the key paths used within a template expression.
   * @example
   * ```ts
   * const value = {
   *  kind: "TemplateExpression",
   *  templateSpans: [
   *    {
   *      kind: "PropertyPathLiteral",
   *      path: ["featured", "h1"],
   *    },
   *    {
   *      kind: "Identifier",
   *      path: "title",
   *    },
   *  ],
   * };
   *
   * const paths = extractTemplateExpressionDataKeyPaths(value);
   * console.log(paths); // [['featured', 'h1], ['title']]
   * ```
   *
   * @param value the template expression to extract key paths from
   * @returns the key paths used within the template expression
   */
  export function extractTemplateExpressionDataKeyPaths(
    value: Tokens.TemplateExpression
  ): Array<Array<string>> {
    const paths: Array<Array<string>> = [];

    for (const span of value.templateSpans) {
      switch (span.kind) {
        case "Identifier":
          paths.push([span.name]);
          break;
        case "PropertyPathLiteral":
          paths.push(span.path);
          break;
        case "StringLiteral":
          break;
      }
    }

    return paths;
  }

  export function renderTemplateExpression(
    expression: Tokens.TemplateExpression,
    context: any
  ) {
    return expression.templateSpans
      .map((span) => {
        switch (span.kind) {
          case "StringLiteral":
            return span.value.toString();
          case "Identifier":
            return context[span.name]?.toString() || "";
          case "PropertyPathLiteral":
            const value = Access.access(context, span.path as any);
            return value !== undefined ? value.toString() : "";
          default:
            return "";
        }
      })
      .join("");
  }
}
