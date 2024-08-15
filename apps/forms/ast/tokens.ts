export namespace Tokens {
  export type Token =
    | Primitive
    | TValueExpression
    | JSONRef
    | Literal
    | ShorthandConditionExpression
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
  export type JSONRef = {
    $ref: `#/fields/${string}`;
  };

  /**
   * Represents the left-hand side of a condition.
   * Can be either a field reference or a literal value.
   */
  type ConditionLHS = JSONRef | Literal;

  /**
   * Represents the right-hand side of a condition.
   * Can be either a field reference or a literal value.
   */
  type ConditionRHS = JSONRef | Literal;

  /**
   * Represents the possible operators for a condition expression.
   */
  export type ConditionOperator = "==" | "!=" | ">" | "<" | ">=" | "<=";

  /**
   * Represents a condition expression, which is a tuple consisting of:
   * - A left-hand side (ConditionLHS)
   * - An operator (ConditionOperator)
   * - A right-hand side (ConditionRHS)
   */
  export type ShorthandConditionExpression<
    LHS extends ConditionLHS = ConditionLHS,
    RHS extends ConditionRHS = ConditionRHS,
  > = [LHS, ConditionOperator, RHS];

  /**
   * Represents a boolean value descriptor.
   * Can be either a simple boolean or a condition expression.
   */
  export type BooleanValueExpression = boolean | ShorthandConditionExpression;

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
    | ShorthandConditionExpression;

  // #endregion

  //
  // #region numeric
  //

  export type NumericBinaryOperator = "+" | "-" | "*" | "/" | "%";

  export type NumericLiteral = {
    kind: "NumericLiteral";
    value: number;
  };

  export type ShorthandBinaryExpressionLHS = NumericValueExpression;
  export type ShorthandBinaryExpressionRHS = NumericValueExpression;

  export type ShorthandBinaryExpression<
    LHS extends ShorthandBinaryExpressionLHS = ShorthandBinaryExpressionLHS,
    RHS extends ShorthandBinaryExpressionRHS = ShorthandBinaryExpressionRHS,
  > = [LHS, NumericBinaryOperator, RHS];

  export type NumericValueExpression =
    | number
    | NumericLiteral
    | PropertyAccessExpression
    | Identifier;

  // #endregion

  export namespace is {
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

    export function jsonRef(exp?: Tokens.Token): exp is Tokens.JSONRef {
      return (
        typeof exp === "object" && "$ref" in exp && exp.$ref.startsWith("#/")
      );
    }

    export function propertyAccessExpression(
      value?: Tokens.Token
    ): value is Tokens.PropertyAccessExpression {
      return (
        typeof value === "object" &&
        "kind" in value &&
        value.kind === "PropertyAccessExpression"
      );
    }

    export function templateExpression(
      value?: Tokens.StringValueExpression
    ): value is Tokens.TemplateExpression {
      return (
        typeof value === "object" &&
        "kind" in value &&
        value.kind === "TemplateExpression"
      );
    }

    /**
     * can't be trusted 100%. use this in the safe context.
     */
    export function inferredShorthandOperationExpression(
      exp: Tokens.Token
    ): exp is
      | Tokens.ShorthandConditionExpression
      | Tokens.ShorthandBinaryExpression {
      const is_array_constructed_well = Array.isArray(exp) && exp.length === 3;
      if (is_array_constructed_well) {
        const [l, op, r] = exp;
        if (typeof op === "string") {
          const _condition_op = ["==", "!=", ">", "<", ">=", "<="];
          if (_condition_op.includes(op)) {
            return true;
          }

          const _numeric_op = ["+", "-", "*", "/", "%"];
          if (_numeric_op.includes(op)) {
            return true;
          }
        }
      }

      return false;
    }
  }
}
