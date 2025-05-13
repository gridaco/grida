import { access } from "./access";
import { tokens } from "./tokens";

export namespace render {
  export function propertyAccessExpression(
    expression: tokens.PropertyAccessExpression,
    context: any
  ) {
    return access.access(context, expression.expression as any);
  }

  export function templateExpression(
    expression: tokens.TemplateExpression,
    context: any
  ) {
    return expression.templateSpans
      .map((span) => {
        switch (span.kind) {
          case "StringLiteral":
            return span.text.toString();
          case "Identifier":
            return context[span.name]?.toString() || "";
          case "PropertyAccessExpression":
            const value = access.access(context, span.expression as any);
            return value !== undefined ? value.toString() : "";
          default:
            return "";
        }
      })
      .join("");
  }

  export function any<T = any>(
    value: T,
    contextdata: Record<string, any>,
    recursive: boolean
  ): any {
    if (tokens.is.propertyAccessExpression(value)) {
      return propertyAccessExpression(value, contextdata);
    } else if (tokens.is.templateExpression(value)) {
      return templateExpression(value, contextdata);
    } else if (recursive && typeof value === "object" && value !== null) {
      // Recursively compute for nested objects/arrays
      if (Array.isArray(value)) {
        return value.map((item) => any(item, contextdata, recursive));
      }
      return Object.entries(value).reduce(
        (acc, [key, nestedValue]) => {
          acc[key] = any(nestedValue, contextdata, recursive);
          return acc;
        },
        {} as Record<string, any>
      );
    } else {
      return value;
    }
  }
}
