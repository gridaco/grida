import { Access } from "./access";
import { Tokens } from "./tokens";

export namespace Factory {
  export namespace strfy {
    export function stringValueExpression(
      exp: Tokens.StringValueExpression
    ): string {
      if (typeof exp === "string") {
        return exp;
      } else if (Tokens.is.propertyAccessExpression(exp)) {
        return exp.expression.join(".");
      } else if (Tokens.is.templateExpression(exp)) {
        return exp.templateSpans
          .map((span) => {
            switch (span.kind) {
              case "StringLiteral":
                return span.text;
              case "Identifier":
                return span.name;
              case "PropertyAccessExpression":
              default:
                return "";
            }
          })
          .join("");
      }
      return "";
    }
  }

  export function createStringLiteral(text: string): Tokens.StringLiteral {
    return {
      kind: "StringLiteral",
      text: text,
    };
  }

  export function createIdentifier(name: string): Tokens.Identifier {
    return {
      kind: "Identifier",
      name,
    };
  }

  export function createPropertyAccessExpression<T = any>(
    paths: Access.KeyPath<T> | string[]
  ): Tokens.PropertyAccessExpression {
    return {
      kind: "PropertyAccessExpression",
      expression: paths as any,
    };
  }

  export function createTemplateExpression(
    templateSpans: Array<Tokens.TemplateSpan>
  ): Tokens.TemplateExpression {
    return {
      kind: "TemplateExpression",
      templateSpans: templateSpans,
    };
  }

  // export function createStringValueExpression(
  //   value?:
  //     | string // static string
  //     | Tokens.PropertyAccessExpression // property path
  //     | Tokens.Identifier // variable
  //     | Tokens.TemplateExpression // template expression
  //     | Tokens.ConditionExpression
  // ): Tokens.StringValueExpression {
  //   if (typeof value === "string") {
  //     return value;
  //   } else if (value?.type === "PropertyAccessExpression") {
  //     return {
  //       kind: "PropertyAccessExpression",
  //       expression: value.expression,
  //     };
  //   } else if (value?.type === "TemplateExpression") {
  //     return {
  //       kind: "TemplateExpression",
  //       templateSpans: value.spans,
  //     } satisfies Tokens.TemplateExpression;
  //   }
  //   return "";
  // }

  /**
   *
   * Extracts the key paths used within a template expression.
   * @example
   * ```ts
   * const value = {
   *  kind: "TemplateExpression",
   *  templateSpans: [
   *    {
   *      kind: "PropertyAccessExpression",
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
  export function getTemplateExpressionDataKeyPaths(
    value: Tokens.TemplateExpression
  ): Array<Array<string>> {
    const paths: Array<Array<string>> = [];

    for (const span of value.templateSpans) {
      switch (span.kind) {
        case "Identifier":
          paths.push([span.name]);
          break;
        case "PropertyAccessExpression":
          paths.push(span.expression);
          break;
        case "StringLiteral":
          break;
      }
    }

    return paths;
  }

  /**
   *
   * resolve expression access identifiers - used to prepare required context data for rendering
   *
   * @example
   * - template expression "`literal ~ ${props.a} ${props.b} ~ literal`" => [["props", "a"], ["props", "b"]]
   * - property access expression `"props.value"` => [["props", "value"]]
   *
   *
   * @param props passed props { key: expression }
   * @returns [dependency array of [access identifiers]]
   */
  export function getStringValueExpressionAccessIdentifiersDependencyArray(
    exp: Tokens.StringValueExpression
  ) {
    if (Tokens.is.propertyAccessExpression(exp)) {
      return [exp.expression];
    } else if (Tokens.is.templateExpression(exp)) {
      return Factory.getTemplateExpressionDataKeyPaths(exp);
    } else {
      return [];
    }
  }

  export function renderPropertyAccessExpression(
    expression: Tokens.PropertyAccessExpression,
    context: any
  ) {
    return Access.access(context, expression.expression as any);
  }

  export function renderTemplateExpression(
    expression: Tokens.TemplateExpression,
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
            const value = Access.access(context, span.expression as any);
            return value !== undefined ? value.toString() : "";
          default:
            return "";
        }
      })
      .join("");
  }
}
