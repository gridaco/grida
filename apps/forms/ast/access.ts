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
  export type KeyPath<T, Depth extends number = 5> = [Depth] extends [never]
    ? never
    : T extends object
      ? {
          [K in Extract<keyof T, string>]: T[K] extends object
            ? [K, ...KeyPath<T[K], Prev[Depth]>] | [K]
            : [K];
        }[Extract<keyof T, string>]
      : never;

  type Prev = [never, 0, 1, 2, 3, 4, 5];

  export type ScopedIdentifiersContext = {
    scopedIdentifiers: { [key: string]: KeyPath<any> };
  };

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

  /**
   * Recursively resolves a path using the provided context. If a part of the path is found in the context's
   * scoped identifiers, it replaces that part with the corresponding path from the context. This process is
   * repeated until the entire path is resolved.
   *
   * @param path - The path to resolve, represented as an array of strings.
   * @param context - The context containing scoped identifiers that map to paths.
   * @returns The resolved path as an array of strings.
   *
   * @example
   * const context = {
   *   scopedIdentifiers: {
   *     identifier: ["b", "c"],
   *     nested: ["identifier", "d"],
   *     deep: ["nested", "e"],
   *   }
   * };
   *
   * const path = ["deep"];
   * const resolvedPath = resolvePath(path, context);
   * console.log(resolvedPath); // Output: ["b", "c", "d", "e"]
   */
  export function resolvePath(
    path: string[],
    context: ScopedIdentifiersContext
  ): string[] {
    return path.flatMap((part) => {
      const resolved = context.scopedIdentifiers[part];
      if (resolved) {
        // Recursively resolve nested context paths
        return resolvePath(resolved as string[], context);
      }
      return [part];
    });
  }

  /**
   * Accesses the value at the specified path in the object, optionally using a context to resolve path identifiers.
   *
   * @template T - The type of the object.
   * @template P - The type of the path.
   *
   * @param obj - The object to access.
   * @param path - The path to the value, represented as an array of strings.
   * @param context - Optional context containing scoped identifiers that map to paths.
   * @returns The value at the specified path in the object, or undefined if the path does not exist.
   *
   * @example
   * const obj = {
   *   b: {
   *     c: {
   *       d: "hello",
   *     },
   *   },
   * };
   *
   * const context = {
   *   scopedIdentifiers: {
   *     identifier: ["b", "c"],
   *     nested: ["identifier", "d"],
   *     deep: ["nested", "e"],
   *   }
   * };
   *
   * const helloPath: KeyPath<typeof obj> = ["b", "c", "d"];
   * console.log(access(obj, helloPath)); // Output: "hello"
   *
   * const wrappedPath = ["deep"] as OkWithContext<typeof context>;
   * console.log(access(obj, wrappedPath, context)); // Output: "hello"
   */
  export function access<T, P extends KeyPath<T>>(
    obj: T,
    path: P,
    context?: ScopedIdentifiersContext
  ): any {
    // Resolve the path using context if provided
    const resolvedPath = context
      ? resolvePath(path as string[], context)
      : (path as string[]);

    if (resolvedPath.length === 0) {
      return undefined;
    }

    // Traverse the resolved path
    return resolvedPath.reduce((acc, part) => {
      if (acc && typeof acc === "object" && part in acc) {
        return (acc as any)[part];
      }
      return undefined;
    }, obj);
  }

  /**
   * Function to select and merge values from an object based on selected property paths.
   *
   * @template T - The type of the data.
   * @param obj - The object from which to select values.
   * @param paths - The property paths to select.
   * @param context - Optional context containing scoped identifiers that map to paths.
   * @returns A merged object containing the selected values.
   */
  export function select<T = any, P extends KeyPath<T> = any>(
    obj: T,
    paths: P[],
    context?: ScopedIdentifiersContext
  ): Partial<T> {
    const result: any = {};

    paths.forEach((path) => {
      const resolvedPath = context
        ? resolvePath(path as string[], context)
        : (path as string[]);
      const value = access(obj, resolvedPath as any, context);

      if (value !== undefined) {
        let current = result;

        (path as string[]).forEach((key, index) => {
          if (index === (path as string[]).length - 1) {
            current[key] = value;
          } else {
            if (!current[key]) {
              current[key] = {};
            }
            current = current[key];
          }
        });
      }
    });

    return result;
  }
}
