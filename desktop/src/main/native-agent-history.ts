// GRIDA-SEC-004 — bounded references to committed history from the attached host.
export namespace NativeAgentHistory {
  export type Anchor =
    | { kind: "inherited"; message: string }
    | { kind: "turn"; turn: string; message: string };

  export type Basis = {
    view: number;
    tail: { turn: string; ordinal: number; position: number } | null;
    fingerprint: readonly number[];
  };

  const ID = /^[A-Za-z0-9_.:@/-]{1,256}$/;

  export function anchor(value: unknown): Anchor | null {
    const result = object(value);
    if (!identity(result?.message)) return null;
    if (result.kind === "inherited")
      return { kind: "inherited", message: result.message };
    if (result.kind === "turn" && identity(result.turn))
      return { kind: "turn", turn: result.turn, message: result.message };
    return null;
  }

  export function basis(value: unknown): Basis | null {
    const result = object(value);
    if (
      !revision(result?.view) ||
      !Array.isArray(result.fingerprint) ||
      result.fingerprint.length !== 32 ||
      !result.fingerprint.every((byte) => revision(byte) && byte <= 255)
    )
      return null;
    const fingerprint: number[] = [...result.fingerprint];
    if (result.tail === null)
      return { view: result.view, tail: null, fingerprint };
    const tail = object(result.tail);
    if (
      !identity(tail?.turn) ||
      !revision(tail.ordinal) ||
      !revision(tail.position)
    )
      return null;
    return {
      view: result.view,
      tail: { turn: tail.turn, ordinal: tail.ordinal, position: tail.position },
      fingerprint,
    };
  }

  export function object(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  export function identity(value: unknown): value is string {
    return typeof value === "string" && ID.test(value);
  }

  export function revision(value: unknown): value is number {
    return (
      typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    );
  }
}
