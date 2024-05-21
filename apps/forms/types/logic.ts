/**
 * depending on usage, the reference can be a name (key) or id
 * - when stored in the database, it should be an id
 * - when used in the json, it should be a key
 */
export type JSONFieldReference<T extends string = string> = {
  $ref: `#/fields/${string}`;
};

type JSONLiteral = string | number | boolean;

type JSONConditionLefthand<T extends string = string> =
  | JSONFieldReference<T>
  | JSONLiteral;

type JSONConditionOperator = "==" | "!=" | ">" | "<" | ">=" | "<=";

type JSONConditionRighthand<T extends string = string> =
  | JSONFieldReference<T>
  | JSONLiteral;

type JSONCondition<T extends string = string> = [
  JSONConditionLefthand<T>,
  JSONConditionOperator,
  JSONConditionRighthand<T>,
];

export type JSONBooleanValueDescriptor<T extends string = string> =
  | boolean
  | JSONCondition<T>;
