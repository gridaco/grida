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

// NOTE: `tokens.access` some how fails to resolve in some compilers. - we use `tokens.Access` instead
export namespace tokens.Access {
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
  export function access<T extends object, P extends string[] | KeyPath<T>>(
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
  export function select<
    T extends object = any,
    P extends string[] | KeyPath<T> = any,
  >(obj: T, paths: P[], context?: ScopedIdentifiersContext): Partial<T> {
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

export namespace tokens.factory {
  export namespace strfy {
    export function stringValueExpression(
      exp: tokens.PropertyAccessExpression | tokens.StringValueExpression
    ): string {
      if (typeof exp === "string") {
        return exp;
      } else if (tokens.is.propertyAccessExpression(exp)) {
        return exp.expression.join(".");
      } else if (tokens.is.templateExpression(exp)) {
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

  export function createStringLiteral(text: string): tokens.StringLiteral {
    return {
      kind: "StringLiteral",
      text: text,
    };
  }

  export function createIdentifier(name: string): tokens.Identifier {
    return {
      kind: "Identifier",
      name,
    };
  }

  export function createPropertyAccessExpression<T = any>(
    paths: tokens.Access.KeyPath<T> | string[]
  ): tokens.PropertyAccessExpression {
    return {
      kind: "PropertyAccessExpression",
      expression: paths as any,
    };
  }

  export function createTemplateExpression(
    templateSpans: Array<tokens.TemplateSpan>
  ): tokens.TemplateExpression {
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
    value: tokens.TemplateExpression
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
    exp: tokens.StringValueExpression
  ) {
    if (tokens.is.propertyAccessExpression(exp)) {
      return [exp.expression];
    } else if (tokens.is.templateExpression(exp)) {
      return factory.getTemplateExpressionDataKeyPaths(exp);
    } else {
      return [];
    }
  }
}

export namespace tokens.render {
  export function propertyAccessExpression(
    expression: tokens.PropertyAccessExpression,
    context: any
  ) {
    return tokens.Access.access(context, expression.expression as any);
  }

  export function templateExpression(
    expression: tokens.TemplateExpression,
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
            const value = tokens.Access.access(context, span.expression as any);
            return value !== undefined ? value.toString() : "";
          default:
            return "";
        }
      })
      .join("");
  }

  export function any<T = any>(
    value: T,
    contextdata: Record<string, any>,
    recursive: boolean
  ): any {
    if (tokens.is.propertyAccessExpression(value)) {
      return tokens.render.propertyAccessExpression(value, contextdata);
    } else if (tokens.is.templateExpression(value)) {
      return tokens.render.templateExpression(value, contextdata);
    } else if (recursive && typeof value === "object" && value !== null) {
      // Recursively compute for nested objects/arrays
      if (Array.isArray(value)) {
        return value.map((item) => any(item, contextdata, recursive));
      }
      return Object.entries(value).reduce(
        (acc, [key, nestedValue]) => {
          acc[key] = any(nestedValue, contextdata, recursive);
          return acc;
        },
        {} as Record<string, any>
      );
    } else {
      return value;
    }
  }
}

/**
 * Utility types
 */
export namespace tokens.utils {
  /**
   * Utility type to create a new type from `T` where:
   * - Properties specified in the keys `K` retain their original types from `T`.
   * - All other properties are replaced with the `tokens.Token` type.
   *
   * This is useful for scenarios where certain properties in an object should remain fixed,
   * while others can be dynamic or "tokenizable."
   *
   * @template T - The base object type.
   * @template K - The keys in `T` that should retain their original types.
   *
   * @example
   * // Example 1: Basic Usage
   * type Original = {
   *   type: "static";
   *   value: number;
   *   description: string;
   * };
   *
   * type Tokenized = TokenizableExcept<Original, "type">;
   * // Resulting type:
   * // {
   * //   type: "static";        // Retained original type
   * //   value: tokens.Token;   // Tokenized
   * //   description: tokens.Token; // Tokenized
   * // }
   *
   * @example
   * // Example 2: Union Types
   * type UnionType =
   *   | { kind: "a"; data: string }
   *   | { kind: "b"; data: number };
   *
   * type TokenizedUnion = TokenizableExcept<UnionType, "kind">;
   * // Resulting type:
   * // {
   * //   kind: "a"; // Retained
   * //   data: tokens.Token; // Tokenized
   * // } | {
   * //   kind: "b"; // Retained
   * //   data: tokens.Token; // Tokenized
   * // }
   *
   * @note
   * This utility only operates at the top level. It does not recursively tokenize nested properties.
   */
  export type TokenizableExcept<T extends object, K extends keyof T> = {
    [P in keyof T]: P extends K ? T[P] : tokens.Token;
  };
}
