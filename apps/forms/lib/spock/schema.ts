export type TProperty<T extends object = {}> = {
  name: string;
  type:
    | "string"
    | "number"
    | "integer"
    | "object"
    | "array"
    | "boolean"
    | "null"
    | ({} | string);
  properties?: TProperty<T>[];
} & T;

export type TSchema<T extends object = {}> = Omit<TProperty<T>, "name">;

export function accessSchema<T extends object>(
  path: string[],
  schema: TSchema<T>
): TSchema | null {
  let current: TSchema = schema;

  for (let key of path) {
    if (current.type === "object" && current.properties) {
      const next = current.properties.find((prop) => prop.name === key);
      if (!next) return null;
      current = next;
    } else {
      return null;
    }
  }

  return current;
}
