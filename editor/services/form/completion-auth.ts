import { timingSafeEqual } from "node:crypto";

/** Temporary self-HTTP authority while the current Next owner is verified. */
export namespace FormCompletionAuth {
  export function headers(): Record<string, string> {
    const key = process.env.GRIDA_S2S_PRIVATE_API_KEY;
    if (!key) throw new Error("Forms completion authority is not configured");
    return { "Content-Type": "application/json", "x-grida-s2s-key": key };
  }

  export function authorize(request: Request): Response | null {
    const expected = process.env.GRIDA_S2S_PRIVATE_API_KEY;
    if (!expected) return Response.json({ ok: false }, { status: 500 });
    const supplied = request.headers.get("x-grida-s2s-key");
    if (!supplied) return Response.json({ ok: false }, { status: 401 });
    const a = Buffer.from(expected);
    const b = Buffer.from(supplied);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return Response.json({ ok: false }, { status: 403 });
    }
    return null;
  }
}
