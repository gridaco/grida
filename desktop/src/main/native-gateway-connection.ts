// GRIDA-SEC-004 / GRIDA-SEC-006 / GRIDA-GG: desktop — native chat bearer custody.
import { createHash } from "node:crypto";
import type {
  DesktopAccountSession,
  DesktopGatewayGrant,
} from "./account-session";
import type { NativeProviderNetwork } from "./native-provider-egress";

const RENEWAL_MARGIN_MS = 30_000;
type Account = Pick<DesktopAccountSession, "withGatewayGrant">;

export class NativeGatewayConnection implements NativeProviderNetwork {
  readonly scope: string;
  readonly endpoint: string;
  private readonly target: string;
  private readonly closing = new AbortController();
  #grant: DesktopGatewayGrant | undefined;
  private renewal: Promise<void> | undefined;

  private constructor(
    origin: string,
    private readonly account: Account,
    private readonly network: NativeProviderNetwork,
    grant: DesktopGatewayGrant
  ) {
    this.endpoint = new URL("/api/v1/ai", origin).href;
    this.target = `${this.endpoint}/chat/completions`;
    this.scope = createHash("sha256")
      .update(
        JSON.stringify([
          "desktop-gateway-chat-v1",
          origin,
          grant.subject,
          grant.organizationId,
        ])
      )
      .digest("hex");
    this.#grant = grant;
  }

  static async open(options: {
    origin: string;
    account: Account;
    network: NativeProviderNetwork;
    organizationId?: number;
    signal?: AbortSignal;
  }): Promise<NativeGatewayConnection> {
    const { origin, account, network, organizationId, signal } = options;
    const base = new URL(origin);
    if (
      base.origin !== origin ||
      (base.protocol !== "https:" &&
        (base.protocol !== "http:" ||
          !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)))
    )
      throw new Error("native_gateway_origin_invalid");
    let captured: DesktopGatewayGrant | undefined;
    await account.withGatewayGrant(
      organizationId,
      (grant) => {
        captured = grant;
      },
      signal
    );
    if (!captured?.isCurrent() || signal?.aborted)
      throw new Error("native_gateway_account_unavailable");
    return new NativeGatewayConnection(origin, account, network, captured);
  }

  prepare(target: string, headers: Headers) {
    if (
      target !== this.target ||
      headers.has("authorization") ||
      !this.#grant?.isCurrent() ||
      this.closing.signal.aborted
    )
      return null;
    return async (body: Buffer, request: AbortSignal) => {
      const signal = AbortSignal.any([request, this.closing.signal]);
      if (signal.aborted) return null;
      const grant = await this.currentGrant();
      if (
        !grant?.isCurrent() ||
        grant.expiresAt <= Date.now() ||
        signal.aborted
      )
        return null;
      const authorized = new Headers(headers);
      authorized.set("authorization", `Bearer ${grant.token}`);
      let dispatch;
      try {
        dispatch = this.network.prepare(this.target, authorized);
      } catch {
        return null;
      }
      return dispatch ? dispatch(body, signal) : null;
    };
  }

  close(): void {
    this.#grant = undefined;
    this.closing.abort();
  }

  private async currentGrant(): Promise<DesktopGatewayGrant | undefined> {
    const previous = this.#grant;
    if (!previous?.isCurrent()) return;
    if (previous.expiresAt > Date.now() + RENEWAL_MARGIN_MS) return previous;
    this.renewal ??= this.account
      .withGatewayGrant(
        previous.organizationId,
        (next) => {
          if (
            this.closing.signal.aborted ||
            this.#grant !== previous ||
            !previous.isCurrent() ||
            !next.isCurrent() ||
            previous.subject !== next.subject ||
            previous.organizationId !== next.organizationId ||
            next.expiresAt <= Date.now() + RENEWAL_MARGIN_MS
          )
            return;
          this.#grant = next;
        },
        this.closing.signal
      )
      .catch(() => {})
      .finally(() => {
        this.renewal = undefined;
      });
    await this.renewal;
    return this.#grant !== previous ? this.#grant : undefined;
  }
}
