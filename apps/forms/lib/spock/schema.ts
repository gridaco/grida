// Type type
export type TType = {
  type:
    | "string"
    | "number"
    | "integer"
    | "object"
    | "array"
    | "boolean"
    | "null";
};

// Properties type (for object types)
export type TProperties<T extends object = {}> = {
  properties: { [key: string]: TProperty<T> };
};

// Reference type
export type TRef<T> = {
  $ref: string;
} & T;

// TProperty definition, combining name, type, properties, or $ref
export type TProperty<T extends object = {}> = (
  | (TType & Partial<TProperties<T>>)
  | TRef<T>
) &
  T;

// TSchema: Root schema cannot be a $ref
export type TSchema<T extends object = {}> = (TType & Partial<TProperties<T>>) &
  T;

export function accessSchema<T extends object>(
  path: string[],
  schema: TSchema<T>
): TProperty<T> | null {
  let current: TSchema<T> = schema;

  for (let key of path) {
    // Check if current schema is an object and has properties
    if (
      "type" in current &&
      current.type === "object" &&
      current.properties &&
      typeof current.properties === "object"
    ) {
      // Access the next property by key
      const next = current.properties[key];
      if (!next) return null;

      // Check if the next property contains a $ref
      if ("$ref" in next) {
        return null;
      }

      current = next as TSchema<T>;
    } else {
      return null;
    }
  }
  return current as TProperty<T>;
}
