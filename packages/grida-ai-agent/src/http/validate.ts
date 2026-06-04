import type { Context } from "hono";

/**
 * Tiny body-shape validator for agent server HTTP routes. Replaces the ~10
 * copies of `const body = (await c.req.json().catch(() => ({}))) as
 * {x?: unknown}; if (typeof body.x !== "string" || body.x.length === 0)
 * return c.json({error: "..."}, 400);` that the routes accumulated.
 *
 * Why not zod / typebox / valibot: the surface is small (~12 fields
 * across all routes) and the existing per-field error messages are
 * already user-facing. A 60kB dep would buy nothing.
 *
 * Validator returns either `{ok:true, value}` with the narrowed type
 * or `{ok:false, error}` with a human-readable suffix that `body()`
 * prefixes with the field name.
 */
export type Validator<T> = (
  raw: unknown
) => { ok: true; value: T } | { ok: false; error: string };

export namespace v {
  export const string: Validator<string> = (raw) =>
    typeof raw === "string" && raw.length > 0
      ? { ok: true, value: raw }
      : { ok: false, error: "must be a non-empty string" };

  export const stringAllowEmpty: Validator<string> = (raw) =>
    typeof raw === "string"
      ? { ok: true, value: raw }
      : { ok: false, error: "must be a string" };

  export const boolean: Validator<boolean> = (raw) =>
    typeof raw === "boolean"
      ? { ok: true, value: raw }
      : { ok: false, error: "must be a boolean" };

  export const array: Validator<unknown[]> = (raw) =>
    Array.isArray(raw)
      ? { ok: true, value: raw }
      : { ok: false, error: "must be an array" };

  export function oneOf<T extends string>(allowed: readonly T[]): Validator<T> {
    return (raw) => {
      if (
        typeof raw === "string" &&
        (allowed as readonly string[]).includes(raw)
      ) {
        return { ok: true, value: raw as T };
      }
      return {
        ok: false,
        error: `must be one of: ${allowed.join(", ")}`,
      };
    };
  }

  export function optional<T>(inner: Validator<T>): Validator<T | undefined> {
    return (raw) => {
      if (raw === undefined) return { ok: true, value: undefined };
      const result = inner(raw);
      if (result.ok) return { ok: true, value: result.value };
      return result;
    };
  }
}

type Schema = Record<string, Validator<unknown>>;
type Inferred<S extends Schema> = {
  [K in keyof S]: S[K] extends Validator<infer T> ? T : never;
};

/**
 * Parse + validate a JSON body. Returns either the typed `data` or a
 * pre-built `c.json({error}, 400)` response the caller returns.
 *
 * On malformed or non-object JSON we fall through with an empty object
 * — each declared field then fails its own validator and the user gets
 * a specific "x must be …" message rather than a generic "bad body".
 */
export async function body<S extends Schema>(
  c: Context,
  schema: S
): Promise<{ ok: true; data: Inferred<S> } | { ok: false; res: Response }> {
  let raw: Record<string, unknown> = {};
  try {
    const parsed = await c.req.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      raw = parsed as Record<string, unknown>;
    }
  } catch {
    // raw stays {}
  }
  const data: Record<string, unknown> = {};
  for (const key of Object.keys(schema)) {
    const result = schema[key](raw[key]);
    if (!result.ok) {
      return {
        ok: false,
        res: c.json({ error: `${key} ${result.error}` }, 400),
      };
    }
    data[key] = result.value;
  }
  return { ok: true, data: data as Inferred<S> };
}
