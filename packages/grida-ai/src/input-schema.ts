// GRIDA-SEC-004 — one definition owns native input validation and JSON description.
export type InputJson =
  | null
  | boolean
  | number
  | string
  | readonly InputJson[]
  | { readonly [key: string]: InputJson };
export type InputJsonSchema = Readonly<Record<string, InputJson>>;

/** Private, bounded input vocabulary. This is not a public schema/plugin runtime. */
export namespace InputSchema {
  export type Json = InputJson;
  export type Schema = InputJsonSchema;
  export type Rule<T> = {
    readonly schema: Schema;
    parse(value: unknown, json?: boolean): T;
  };
  type Fields = Record<string, Rule<unknown> & { optional?: boolean }>;
  type Shape<F extends Fields> = { [K in keyof F]: ReturnType<F[K]["parse"]> };

  export function freeze<T>(value: T): T {
    if (value && typeof value === "object" && !(value instanceof Uint8Array)) {
      for (const item of Object.values(value)) freeze(item);
      Object.freeze(value);
    }
    return value;
  }
  export function object<F extends Fields>(fields: F): Rule<Shape<F>> {
    const names = Object.keys(fields);
    return {
      schema: freeze({
        type: "object",
        additionalProperties: false,
        properties: Object.fromEntries(
          names.map((name) => [name, fields[name]!.schema])
        ),
        required: names.filter((name) => !fields[name]!.optional),
      }),
      parse(value, json = false) {
        exact(value, names);
        if (
          json &&
          Object.getPrototypeOf(value) !== Object.prototype &&
          Object.getPrototypeOf(value) !== null
        )
          throw 0;
        const result: Record<string, unknown> = {};
        for (const name of names) {
          const input = value[name];
          if (json && input === undefined && Object.hasOwn(value, name))
            throw 0;
          result[name] = fields[name]!.parse(input, json);
        }
        return result as Shape<F>;
      },
    };
  }
  export function optional<T>(
    rule: Rule<T>,
    fallback?: T
  ): Rule<T | undefined> & { optional: true } {
    return {
      optional: true,
      schema:
        fallback === undefined
          ? rule.schema
          : freeze({ ...rule.schema, default: fallback as Json }),
      parse: (value, json) =>
        value === undefined ? fallback : rule.parse(value, json),
    };
  }
  export function string(
    options: {
      trim?: boolean;
      nonblank?: boolean;
      max?: number;
      unit?: "codepoints" | "utf16";
      voice?: boolean;
    } = {}
  ): Rule<string> {
    const {
      trim = false,
      nonblank = false,
      max,
      unit = "codepoints",
      voice = false,
    } = options;
    return {
      schema: freeze({
        type: "string",
        ...(trim ? { "x-grida-trim": true } : {}),
        ...(nonblank ? { "x-grida-nonblank": true } : {}),
        ...(max === undefined
          ? {}
          : trim || unit === "utf16"
            ? { "x-grida-max-length": max, "x-grida-length-unit": unit }
            : { maxLength: max }),
        ...(voice
          ? {
              "x-grida-uri-segment": true,
              "x-grida-excluded-values": [".", ".."],
            }
          : {}),
      }),
      parse(value) {
        if (typeof value !== "string") throw 0;
        const text = trim ? value.trim() : value;
        if (nonblank && !text.trim()) throw 0;
        if (max !== undefined) {
          if (unit === "utf16") {
            if (text.length > max) throw 0;
          } else {
            let count = 0;
            for (const _ of text) if (++count > max) throw 0;
          }
        }
        if (
          voice &&
          (text === "." || text === ".." || !encodeURIComponent(text))
        )
          throw 0;
        return text;
      },
    };
  }
  export function number(
    options: {
      integer?: boolean;
      min?: number;
      exclusiveMin?: number;
      max?: number;
      exclude?: number;
    } = {}
  ): Rule<number> {
    const { integer, min, exclusiveMin, max, exclude } = options;
    return {
      schema: freeze({
        type: integer ? "integer" : "number",
        ...(integer
          ? {
              minimum: -Number.MAX_SAFE_INTEGER,
              maximum: Number.MAX_SAFE_INTEGER,
            }
          : {}),
        ...(min === undefined ? {} : { minimum: min }),
        ...(max === undefined ? {} : { maximum: max }),
        ...(exclusiveMin === undefined
          ? {}
          : { exclusiveMinimum: exclusiveMin }),
        ...(exclude === undefined ? {} : { not: { const: exclude } }),
      }),
      parse(value) {
        if (
          typeof value !== "number" ||
          !Number.isFinite(value) ||
          (integer && !Number.isSafeInteger(value)) ||
          (min !== undefined && value < min) ||
          (max !== undefined && value > max) ||
          (exclusiveMin !== undefined && value <= exclusiveMin) ||
          value === exclude
        )
          throw 0;
        return value;
      },
    };
  }
  export const boolean: Rule<boolean> = {
    schema: freeze({ type: "boolean" }),
    parse(value) {
      if (typeof value !== "boolean") throw 0;
      return value;
    },
  };
  export function enumeration<const T extends readonly (string | number)[]>(
    values: T
  ): Rule<T[number]> {
    return {
      schema: freeze({ type: typeof values[0], enum: [...values] }),
      parse(value) {
        if (
          (typeof value !== "string" && typeof value !== "number") ||
          !values.includes(value)
        )
          throw 0;
        return value as T[number];
      },
    };
  }
  export function pair(delimiter: "x" | ":", integer = true): Rule<string> {
    const segment = integer ? "[0-9]+" : "[0-9]+(?:\\.[0-9]+)?";
    const pattern = `^${segment}${delimiter}${segment}$`;
    return {
      schema: freeze({
        type: "string",
        pattern,
        "x-grida-positive-pair": integer ? "safe-integer" : "finite-number",
      }),
      parse(value) {
        if (
          typeof value !== "string" ||
          !new RegExp(pattern).test(value) ||
          !value
            .split(delimiter)
            .every(
              (part) =>
                Number(part) > 0 &&
                (integer
                  ? Number.isSafeInteger(Number(part))
                  : Number.isFinite(Number(part)))
            )
        )
          throw 0;
        return value;
      },
    };
  }
  export function url(imageData = false, fragments = false): Rule<string> {
    return {
      schema: freeze({
        type: "string",
        "x-grida-url": {
          schemes: imageData ? ["https", "image-data"] : ["https"],
          userinfo: false,
          fragments,
        },
      }),
      parse(value) {
        if (typeof value !== "string") throw 0;
        const url = new URL(value);
        if (
          (url.protocol !== "https:" &&
            !(
              imageData &&
              url.protocol === "data:" &&
              /^data:image\/[a-z0-9.+-]+[;,]/i.test(value)
            )) ||
          url.username ||
          url.password ||
          (!fragments && url.hash)
        )
          throw 0;
        return value;
      },
    };
  }
  export function array<T>(item: Rule<T>, maximum: number): Rule<T[]> {
    return {
      schema: freeze({
        type: "array",
        minItems: 1,
        maxItems: maximum,
        items: item.schema,
      }),
      parse(value, json) {
        if (!Array.isArray(value) || !value.length || value.length > maximum)
          throw 0;
        return value.map((entry) => item.parse(entry, json));
      },
    };
  }
  export function bytes(maximum: number): Rule<Uint8Array> {
    return {
      schema: freeze({
        type: "string",
        contentEncoding: "base64",
        minLength: 4,
        maxLength: Math.ceil(maximum / 3) * 4,
        pattern: "^[A-Za-z0-9+/]+={0,2}$",
        "x-grida-decoded-max-bytes": maximum,
      }),
      parse(value, json = false) {
        if (json) {
          if (
            typeof value !== "string" ||
            !value.length ||
            value.length > Math.ceil(maximum / 3) * 4 ||
            value.length % 4 !== 0 ||
            !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
          )
            throw 0;
          const padding = value.endsWith("==")
            ? 2
            : value.endsWith("=")
              ? 1
              : 0;
          if ((value.length / 4) * 3 - padding > maximum) throw 0;
          const decoded = atob(value);
          if (!decoded.length || decoded.length > maximum) throw 0;
          return Uint8Array.from(decoded, (character) =>
            character.charCodeAt(0)
          );
        }
        if (
          !(value instanceof Uint8Array) ||
          !value.byteLength ||
          value.byteLength > maximum
        )
          throw 0;
        return new Uint8Array(value);
      },
    };
  }
  export function exact(
    value: unknown,
    keys: readonly string[]
  ): asserts value is Record<string, unknown> {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Reflect.ownKeys(value).some(
        (key) => typeof key !== "string" || !keys.includes(key)
      )
    )
      throw 0;
  }
  /** AbortSignal is native control, deliberately not part of any JSON input schema. */
  export function native<T>(
    rule: Rule<T>,
    value: unknown,
    undefinedOnly: readonly string[] = []
  ): T & { signal?: AbortSignal } {
    const names = Object.keys(rule.schema.properties as Record<string, Json>);
    exact(value, [...names, "signal", ...undefinedOnly]);
    for (const name of undefinedOnly) if (value[name] !== undefined) throw 0;
    const signal = value.signal;
    if (signal !== undefined && !(signal instanceof AbortSignal)) throw 0;
    const fields: Record<string, unknown> = {};
    for (const name of names) fields[name] = value[name];
    return { ...rule.parse(fields), signal };
  }
}
