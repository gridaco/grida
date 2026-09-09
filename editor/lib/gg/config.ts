// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: token — the scoped-token owner's only environment reader.
import "server-only";

export namespace ggConfig {
  /** Read on each operation so signing-key rotation needs no process cache. */
  export function signing(): {
    current: Uint8Array | null;
    previous: Uint8Array | null;
  } {
    return {
      current: secret(process.env.GG_TOKEN_SECRET),
      previous: secret(process.env.GG_TOKEN_SECRET_PREVIOUS),
    };
  }

  /** Absence preserves the existing local-development, unconfigured limiter. */
  export function limiter(): { url: string; token: string } | null {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    return url && token ? { url, token } : null;
  }
}

function secret(raw: string | undefined): Uint8Array | null {
  const value = raw?.trim();
  if (!value) return null;
  const bytes = new TextEncoder().encode(value);
  return bytes.byteLength >= 32 ? bytes : null;
}
