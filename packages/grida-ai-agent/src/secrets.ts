/**
 * GRIDA-SEC-004 — BYOK secret store.
 *
 * Thin façade over `AuthStore` for the `ApiKeyEntry`-shaped records
 * (`openrouter`, `ai-gateway`). The agent host's `/secrets/*` HTTP routes
 * call this; the BYOK provider path in `runtime.ts`
 * calls this internally to pull the key when constructing the
 * @ai-sdk client.
 *
 * **The client never reads secrets back.** There is no `get()`
 * method on the bridge (and none should be added). The agent host uses the
 * key internally; the client can only `has()` / `set()` / `delete()`.
 * This closes the XSS exfil path even if a host bridge's path-scoping
 * defense is somehow bypassed.
 *
 * **Whitespace-only keys are treated as absent.** Matches
 * `editor/lib/ai/models.ts` `resolveByokProvider` —
 * `process.env.BYOK_*_API_KEY?.trim()` — so a user pasting in just
 * whitespace is treated as no configured provider rather than getting
 * a confusing upstream "empty key" error.
 *
 * **Allowed provider ids.** The route layer validates this set;
 * the store doesn't (it would be tempting to centralize the check
 * here, but the route's 400-with-clear-message is much friendlier
 * than a silent ignore here, and the route knows the HTTP shape).
 */

import type { AuthStore, ApiKeyEntry } from "./auth/file";

export class SecretsStore {
  constructor(private readonly auth: AuthStore) {}

  async has(providerId: string): Promise<boolean> {
    const entry = await this.auth.get(providerId);
    if (!entry || entry.type !== "api") return false;
    return entry.key.trim().length > 0;
  }

  /**
   * Caller is responsible for rejecting whitespace-only keys with a
   * 400 — see `http/routes/secrets.ts`. We don't reject here
   * because this is a low-level store; the input validation is at
   * the route layer.
   */
  async set(
    providerId: string,
    key: string,
    metadata?: Record<string, string>
  ): Promise<void> {
    const entry: ApiKeyEntry = {
      type: "api",
      key,
      ...(metadata ? { metadata } : {}),
    };
    await this.auth.set(providerId, entry);
  }

  async delete(providerId: string): Promise<void> {
    await this.auth.remove(providerId);
  }

  /**
   * Internal-only — read back the secret key for agent-host-side use
   * (constructing the @ai-sdk client in `runtime.ts`).
   * NEVER exposed through the HTTP surface; if you find yourself
   * wanting a `/secrets/` route that returns this, stop and re-read
   * the threat model.
   */
  async _getKey(providerId: string): Promise<string | null> {
    const entry = await this.auth.get(providerId);
    if (!entry || entry.type !== "api") return null;
    const trimmed = entry.key.trim();
    return trimmed.length > 0 ? entry.key : null;
  }
}
