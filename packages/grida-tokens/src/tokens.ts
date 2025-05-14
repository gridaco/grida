export namespace tokens {
  export type Token =
    | Primitive
    | TValueExpression
    | JSONRef
    | Literal
    | ShorthandBooleanBinaryExpression
    | ShorthandBinaryExpression
    | BooleanValueExpression
    | Identifier
    | PropertyAccessExpression
    | StringLiteral
    | TemplateSpan
    | TemplateExpression
    | StringValueExpression;

  /**
   * Represents a primitive value.
   * Can be a string, number, or boolean.
   */
  export type Primitive = string | number | boolean;

  /**
   * Represents a literal value, which can be any primitive type.
   */
  type Literal = Primitive;

  export type TValueExpression =
    | JSONRef
    | StringValueExpression
    | BooleanValueExpression
    | NumericValueExpression;

  /**
   * Represents a reference to a JSON field.
   * Depending on usage, the reference can be a name (key) or id.
   * - When stored in the database, it should be an id.
   * - When used in the JSON, it should be a key.
   */
  export type JSONRef<PREFIX extends string = string> = {
    $ref: `#/${PREFIX}${string}`;
  };

  /**
   * Represents the shorthand syntax supported operators for a expression.
   */
  export type BinaryOperator =
    | NumericBinaryOperator
    | BooleanBinaryOperator
    | CoalescingOperator;

  export const BINARY_OPERATORS = [
    "==",
    "!=",
    ">",
    "<",
    ">=",
    "<=",
    "&&",
    "||",
    "+",
    "-",
    "*",
    "/",
    "%",
    "??",
  ] as const;

  export const BOOLEAN_BINARY_OPERATORS = [
    "==",
    "!=",
    ">",
    "<",
    ">=",
    "<=",
    "&&",
    "||",
  ] as const;

  export type BooleanBinaryOperator =
    | "=="
    | "!="
    | ">"
    | "<"
    | ">="
    | "<="
    | "&&"
    | "||";
  export type NumericBinaryOperator = "+" | "-" | "*" | "/" | "%";
  export type CoalescingOperator = "??";

  export type ShorthandBinaryExpressionLHS = TValueExpression;
  export type ShorthandBinaryExpressionRHS = TValueExpression;

  export type ShorthandBinaryExpression<
    LHS extends ShorthandBinaryExpressionLHS = ShorthandBinaryExpressionLHS,
    RHS extends ShorthandBinaryExpressionRHS = ShorthandBinaryExpressionRHS,
  > = [LHS, BinaryOperator, RHS];

  /**
   * Represents the left-hand side of a condition.
   * Can be either a field reference or a literal value.
   */
  type ShorthandBooleanBinaryExpressionLHS = JSONRef | Literal;

  /**
   * Represents the right-hand side of a condition.
   * Can be either a field reference or a literal value.
   */
  type ShorthandBooleanBinaryExpressionRHS = JSONRef | Literal;

  /**
   * Represents a condition expression, which is a tuple consisting of:
   * - A left-hand side (ConditionLHS)
   * - An operator (ConditionOperator)
   * - A right-hand side (ConditionRHS)
   */
  export type ShorthandBooleanBinaryExpression<
    LHS extends
      ShorthandBooleanBinaryExpressionLHS = ShorthandBooleanBinaryExpressionLHS,
    RHS extends
      ShorthandBooleanBinaryExpressionRHS = ShorthandBooleanBinaryExpressionRHS,
  > = [LHS, BooleanBinaryOperator, RHS];

  /**
   * Represents a boolean value descriptor.
   * Can be either a simple boolean or a condition expression.
   */
  export type BooleanValueExpression =
    | boolean
    | ShorthandBooleanBinaryExpression;

  /**
   * Represents an identifier (variable) in a template.
   */
  export type Identifier = {
    kind: "Identifier";
    name: string;
  };

  /**
   * Represents a shorthand for accessing properties.
   * This encapsulates the concept of a property path more effectively.
   */
  export type PropertyAccessExpression = {
    kind: "PropertyAccessExpression";
    expression: Array<string>;
  };

  //
  // #region string
  //

  /**
   * Represents a string literal.
   */
  export type StringLiteral = {
    kind: "StringLiteral";
    text: string;
  };

  /**
   * Represents a span in a template, which can be a string literal, an identifier, or a property path literal.
   */
  export type TemplateSpan =
    | StringLiteral
    | Identifier
    | PropertyAccessExpression;

  /**
   * Represents a template expression consisting of template spans.
   */
  export type TemplateExpression = {
    kind: "TemplateExpression";
    templateSpans: TemplateSpan[];
  };

  /**
   * Represents a string value expression, which can be any of the defined types.
   */
  export type StringValueExpression =
    | string // static string
    | StringLiteral
    | PropertyAccessExpression // property path
    | Identifier // variable
    | TemplateExpression // template expression
    | ShorthandBooleanBinaryExpression;

  // #endregion

  //
  // #region numeric
  //

  export type NumericLiteral = {
    kind: "NumericLiteral";
    value: number;
  };

  export type NumericValueExpression =
    | number
    | NumericLiteral
    | PropertyAccessExpression
    | ShorthandBinaryExpression<number, number>
    | Identifier;

  // #endregion

  export namespace is {
    /**
     * Recursively checks if a value is tokenized (an expression).
     *
     * A value is considered tokenized if it matches one of the `Token` types defined in `tokens.Token`.
     *
     * @template T - The type of the value being checked.
     * @param value - The value to check.
     * @returns `true` if the value is a tokenized expression, otherwise `false`.
     *
     * @example
     * const value: tokens.Token = { kind: "Identifier", name: "myVariable" };
     * console.log(tokens.is.tokenized(value)); // Output: true
     *
     * const plainValue = 42;
     * console.log(tokens.is.tokenized(plainValue)); // Output: false
     */
    export function tokenized<T = any>(value: T): boolean {
      if (value == null) {
        return false; // Null or undefined is not tokenized
      }

      if (is.primitive(value)) {
        return false; // Primitive types are not tokenized
      }

      if (typeof value === "object") {
        // Check if the value itself is a recognized token
        if (
          tokens.is.templateExpression(value) ||
          tokens.is.propertyAccessExpression(value) ||
          tokens.is.jsonRef(value) ||
          tokens.is.inferredShorthandBinaryExpression(value)
        ) {
          return true;
        }

        // Recursively check nested objects or arrays
        if (Array.isArray(value)) {
          return value.some((item) => tokenized(item)); // Check if any array element is tokenized
        }

        for (const key in value) {
          if (tokenized((value as Record<string, unknown>)[key])) {
            return true; // Check if any property in the object is tokenized
          }
        }
      }

      return false; // If no conditions match, the value is not tokenized
    }

    export function primitive(
      value?: any,
      checknull = true
    ): value is Primitive {
      return (
        (checknull && value === null) ||
        typeof value === "undefined" ||
        //
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      );
    }

    export function jsonRef(
      exp?: tokens.Token | unknown
    ): exp is tokens.JSONRef {
      return (
        typeof exp === "object" &&
        exp !== null &&
        "$ref" in exp &&
        (exp as tokens.JSONRef).$ref?.startsWith("#/")
      );
    }

    export function propertyAccessExpression(
      value?: tokens.Token | unknown
    ): value is tokens.PropertyAccessExpression {
      return (
        typeof value === "object" &&
        value !== null &&
        "kind" in value &&
        value.kind === "PropertyAccessExpression"
      );
    }

    export function templateExpression(
      value?: tokens.StringValueExpression | unknown
    ): value is tokens.TemplateExpression {
      return (
        typeof value === "object" &&
        value !== null &&
        "kind" in value &&
        value.kind === "TemplateExpression"
      );
    }

    /**
     * can't be trusted 100%. use this in the safe context.
     */
    export function inferredShorthandBinaryExpression(
      exp: tokens.Token | unknown
    ): exp is
      | tokens.ShorthandBooleanBinaryExpression
      | tokens.ShorthandBinaryExpression {
      const is_array_constructed_well = Array.isArray(exp) && exp.length === 3;
      if (is_array_constructed_well) {
        const [l, op, r] = exp;
        if (typeof op === "string" && BINARY_OPERATORS.includes(op as any)) {
          return true;
        }
      }

      return false;
    }
  }
}
