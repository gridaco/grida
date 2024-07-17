export namespace Access {
  /**
   * A type that represents a path as an array of strings that are valid keys of the object type T and its nested objects.
   *
   * @template T - The type of the object.
   *
   * @example
   *
   * ```ts
   * const obj = {
   *   b: {
   *     c: {
   *       d: "hello",
   *     },
   *   },
   * };
   *
   * type OBJ = typeof obj;
   *
   * const helloPath: KeyPath<OBJ> = ["b", "c", "d"];
   * ```
   */
  export type KeyPath<T> = T extends object
    ? {
        [K in keyof T]: T[K] extends object ? [K, ...KeyPath<T[K]>] : [K];
      }[keyof T]
    : never;

  /**
   * A utility type that recursively extracts the type of a value at a given path in an object.
   *
   * @template T - The type of the object.
   * @template P - The path as an array of strings.
   */
  export type PathValue<T, P extends string[]> = P extends [
    infer K,
    ...infer Rest,
  ]
    ? K extends keyof T
      ? Rest extends string[]
        ? PathValue<T[K], Rest>
        : T[K]
      : never
    : T;

  export function access<T, P extends KeyPath<T>>(
    obj: T,
    path: P
    // @ts-ignore
  ): PathValue<T, P> {
    // @ts-expect-error
    return path.reduce((acc, part) => {
      if (acc && typeof acc === "object" && part in acc) {
        return (acc as any)[part];
      }
      return undefined;
      // @ts-ignore
    }, obj) as PathValue<T, P>;
  }

  /**
   * Function to select and merge values from an object based on selected property paths.
   *
   * @template T - The type of the data.
   * @param obj - The object from which to select values.
   * @param paths - The property paths to select.
   * @returns A merged object containing the selected values.
   */
  export function select<T>(obj: T, paths: KeyPath<T>[]): Partial<T> {
    const result: any = {};

    paths.forEach((path) => {
      const value = access(obj, path);
      let current = result;

      // @ts-expect-error
      path.forEach((key, index) => {
        if (index === path.length - 1) {
          current[key] = value;
        } else {
          if (!current[key]) {
            current[key] = {};
          }
          current = current[key];
        }
      });
    });

    return result;
  }
}
