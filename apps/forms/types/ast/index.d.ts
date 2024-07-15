export namespace Tokens {
  /**
   * Represents a primitive value.
   * Can be a string, number, or boolean.
   */
  export type Primitive = string | number | boolean;

  /**
   * Represents a literal value, which can be any primitive type.
   */
  type Literal = Primitive;

  /**
   * depending on usage, the reference can be a name (key) or id
   * - when stored in the database, it should be an id
   * - when used in the json, it should be a key
   */
  export type JSONFieldReference = {
    $ref: `#/fields/${string}`;
  };

  /**
   * Represents the left-hand side of a condition.
   * Can be either a field reference or a literal value.
   *
   * @template T - The type of the reference string, defaults to string.
   */
  type ConditionLHS<T extends Literal> = JSONFieldReference | T;

  /**
   * Represents the right-hand side of a condition.
   * Can be either a field reference or a literal value.
   *
   * @template T - The type of the reference string, defaults to string.
   */
  type ConditionRHS<T extends Literal> = JSONFieldReference | T;

  /**
   * Represents the possible operators for a condition expression.
   */
  export type ConditionOperator = "==" | "!=" | ">" | "<" | ">=" | "<=";

  /**
   * Represents a condition expression, which is a tuple consisting of:
   * - A left-hand side (ConditionLHS)
   * - An operator (ConditionOperator)
   * - A right-hand side (ConditionRHS)
   *
   * @template T - The type of the reference string, defaults to string.
   */
  export type ConditionExpression = [
    ConditionLHS<any>,
    ConditionOperator,
    ConditionRHS<any>,
  ];

  /**
   * Represents a boolean value descriptor.
   * Can be either a simple boolean or a condition expression.
   *
   * @template T - The type of the reference string, defaults to string.
   */
  export type BooleanValue = boolean | ConditionExpression;

  /**
   * Represents an identifier (variable) in a template.
   */
  type Identifier = {
    kind: "Identifier";
    name: string;
  };

  // /**
  //  * Represents a property access expression in a template.
  //  * @deprecated Use PropertyPathLiteral instead.
  //  *
  //  * This is although a standard AST node, it is not very useful in the context of json building
  //  */
  // type PropertyAccessExpression = {
  //   kind: "PropertyAccessExpression";
  //   expression: Identifier | PropertyAccessExpression;
  //   name: string;
  // };

  /**
   * Represents a property path literal in a template.
   * This encapsulates the concept of a property path more effectively.
   */
  type PropertyPathLiteral = {
    kind: "PropertyPathLiteral";
    path: string;
  };

  /**
   * Represents a string literal in a template.
   */
  type TemplateStringLiteral = {
    kind: "StringLiteral";
    value: string;
  };

  /**
   * Represents a span in a template, which can be a string literal, an identifier, or a property access expression.
   */
  type TemplateSpan = TemplateStringLiteral | Identifier | PropertyPathLiteral;

  type TemplateExpression = {
    type: "TemplateExpression";
    templateSpans: TemplateSpan[];
  };

  /**
   * Represents a value expression, which can be any of the defined types.
   */
  export type StringValueExpression =
    | string
    | TemplateExpression
    | ConditionExpression;
}
