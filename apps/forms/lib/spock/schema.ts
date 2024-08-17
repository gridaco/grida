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

const inferType = (
  value: any
):
  | "string"
  | "number"
  | "object"
  | "array"
  | "boolean"
  | "null"
  | "unknown" => {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  if (typeof value === "object") {
    return "object";
  }
  if (typeof value === "string") {
    return "string";
  }
  if (typeof value === "number") {
    return "number";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  return "unknown";
};

/**
 * Infers a JSON schema from the given input data.
 *
 * @param data - The input data from which to infer the schema.
 * @param currentPath - The current path within the object being processed.
 * @param options - Options for schema transformation.
 * @param options.transformthis - When set to `true`, injects the 'this' property into object properties.
 *
 * @returns A JSON schema inferred from the input data.
 */
export const inferSchemaFromData = (
  data: Record<string, any>,
  currentPath: string[] = [],
  options = {
    transformthis: false,
    keepvalue: true,
  }
): TSchema => {
  const transform = (
    obj: Record<string, any>,
    path: string[] = []
  ): TSchema => {
    const properties: { [key: string]: any } = {};

    Object.keys(obj).forEach((key: string) => {
      const value = obj[key];
      const type = inferType(value);
      const newPath = [...path, key];
      const propertyPath = `#/properties/${newPath.join("/properties/")}`;

      if (type === "object") {
        const defaultproperties = transform(value, newPath).properties;
        properties[key] = {
          type: "object",
          properties: options.transformthis
            ? {
                ...defaultproperties,
                this: {
                  $ref: propertyPath,
                },
              }
            : defaultproperties,
        };
      } else {
        properties[key] = {
          type,
        };

        if (options.keepvalue) {
          properties[key].value = value;
        }
      }
    });

    return {
      type: "object",
      properties,
    };
  };

  return transform(data, currentPath);
};
