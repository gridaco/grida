/**
 * GRIDA-SEC-008 — native-host orchestration for ChatGPT subscription OAuth.
 *
 * The renderer may request connect/cancel/status/sign-out through guarded IPC,
 * but every sensitive step stays here: bind the loopback callback, ask the
 * sidecar to mint PKCE state, validate/open the provider URL, and forward one
 * valid code back to the credential owner. Only an explicitly reconstructed
 * secret-free status DTO is returned to the renderer.
 */

import type {
  ChatGptSubscriptionAccount,
  ChatGptSubscriptionStatus,
} from "@grida/agent";
import type { ChatGptConnectResult } from "@grida/desktop-bridge";
import {
  CHATGPT_AUTH_ROUTE_PATHS,
  type ChatGptAuthStart,
} from "@grida/agent/server";
import {
  CHATGPT_CALLBACK_PATH,
  CHATGPT_CALLBACK_PORTS,
  validateChatGptAuthorizationUrl,
} from "../chatgpt-configuration";
import { OAuthLoopbackCallback } from "./oauth-loopback-callback";

type ActiveConnect = {
  attempt: OAuthLoopbackCallback.Attempt;
  attempt_id: string | null;
  cancelled: boolean;
  cancel_sent: boolean;
  cancel_in_flight: Promise<void> | null;
  completed_status: ChatGptSubscriptionStatus | null;
};

export type ChatGptOAuthCoordinatorDeps = {
  callback: Pick<OAuthLoopbackCallback, "start" | "close">;
  sidecar_fetch: (path: string, init?: RequestInit) => Promise<Response>;
  open_external: (url: string) => Promise<void>;
};

export class ChatGptOAuthCoordinator {
  private active: ActiveConnect | null = null;
  private connectInFlight: Promise<ChatGptConnectResult> | null = null;
  private cancellationEpoch = 0;
  private closed = false;

  constructor(private readonly deps: ChatGptOAuthCoordinatorDeps) {}

  connect(): Promise<ChatGptConnectResult> {
    if (this.closed) {
      return Promise.reject(new Error("ChatGPT sign-in host is closed"));
    }
    this.connectInFlight ??= this.runConnect().finally(() => {
      this.connectInFlight = null;
    });
    return this.connectInFlight;
  }

  async cancel(): Promise<void> {
    this.cancellationEpoch += 1;
    const active = this.active;
    if (!active) return;
    active.cancelled = true;
    active.attempt.cancel();
    await this.cancelSidecarAttempt(active);
  }

  async status(): Promise<ChatGptSubscriptionStatus> {
    return parseStatus(
      await this.postJson(CHATGPT_AUTH_ROUTE_PATHS.status, {})
    );
  }

  async signOut(): Promise<ChatGptSubscriptionStatus> {
    // Sign-out is the authoritative credential deletion. A transient failure
    // on the narrower attempt-cancel route must never prevent it from running.
    await this.cancel().catch(() => undefined);
    await this.postJson(CHATGPT_AUTH_ROUTE_PATHS.sign_out, {});
    return await this.status();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    const active = this.active;
    if (active) {
      active.cancelled = true;
      active.attempt.cancel();
      void this.cancelSidecarAttempt(active).catch(() => undefined);
    }
    this.deps.callback.close();
  }

  private async runConnect(): Promise<ChatGptConnectResult> {
    const startedAtCancellationEpoch = this.cancellationEpoch;
    const attempt = await this.deps.callback.start();
    const active: ActiveConnect = {
      attempt,
      attempt_id: null,
      cancelled: this.cancellationEpoch !== startedAtCancellationEpoch,
      cancel_sent: false,
      cancel_in_flight: null,
      completed_status: null,
    };
    this.active = active;

    try {
      if (active.cancelled) {
        throw new Error("ChatGPT sign-in was cancelled");
      }
      const start = parseStart(
        await this.postJson(CHATGPT_AUTH_ROUTE_PATHS.start, {
          redirect_uri: attempt.redirect_uri,
        })
      );
      active.attempt_id = start.attempt_id;
      if (active.cancelled) {
        await this.cancelSidecarAttempt(active);
        throw new Error("ChatGPT sign-in was cancelled");
      }

      const authorizationUrl = validateChatGptAuthorizationUrl(
        start.authorization_url,
        {
          expected_state: start.state,
          expected_redirect_uri: attempt.redirect_uri,
        }
      );
      attempt.activate({
        state: start.state,
        complete: async ({ code, state, redirect_uri, signal }) => {
          const status = parseStatus(
            await this.postJson(
              CHATGPT_AUTH_ROUTE_PATHS.complete,
              {
                attempt_id: start.attempt_id,
                code,
                state,
              },
              signal
            )
          );
          if (redirect_uri !== attempt.redirect_uri || !status.ready) {
            throw new Error("ChatGPT sign-in did not produce a ready account");
          }
          active.completed_status = status;
        },
      });

      if (active.cancelled) {
        await this.cancelSidecarAttempt(active);
        throw new Error("ChatGPT sign-in was cancelled");
      }
      await this.deps.open_external(authorizationUrl.toString());
      await attempt.result;
      if (!active.completed_status) {
        throw new Error("ChatGPT sign-in completed without account status");
      }
      return active.completed_status;
    } catch (error) {
      const cancelled = active.cancelled;
      attempt.cancel();
      await this.cancelSidecarAttempt(active).catch(() => undefined);
      if (cancelled) {
        return { outcome: "cancelled" };
      }
      throw safeCoordinatorError(error);
    } finally {
      if (this.active === active) this.active = null;
    }
  }

  private async cancelSidecarAttempt(active: ActiveConnect): Promise<void> {
    const attemptId = active.attempt_id;
    if (!attemptId || active.cancel_sent) return;
    if (active.cancel_in_flight) return await active.cancel_in_flight;

    let task!: Promise<void>;
    task = (async () => {
      let firstError: unknown;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          await this.postJson(CHATGPT_AUTH_ROUTE_PATHS.cancel, {
            attempt_id: attemptId,
          });
          active.cancel_sent = true;
          return;
        } catch (error) {
          firstError ??= error;
        }
      }
      throw firstError;
    })().finally(() => {
      if (active.cancel_in_flight === task) {
        active.cancel_in_flight = null;
      }
    });
    active.cancel_in_flight = task;
    await task;
  }

  private async postJson(
    path: string,
    body: object,
    signal?: AbortSignal
  ): Promise<unknown> {
    const response = await this.deps.sidecar_fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      const code = await safeErrorCode(response);
      throw new Error(
        code
          ? `ChatGPT provider request failed (${code})`
          : `ChatGPT provider request failed (HTTP ${response.status})`
      );
    }
    try {
      return await response.json();
    } catch {
      throw new Error("ChatGPT provider returned an invalid response");
    }
  }
}

export function createChatGptOAuthCoordinator(
  deps: Omit<ChatGptOAuthCoordinatorDeps, "callback">
): ChatGptOAuthCoordinator {
  return new ChatGptOAuthCoordinator({
    ...deps,
    callback: new OAuthLoopbackCallback({
      ports: CHATGPT_CALLBACK_PORTS,
      path: CHATGPT_CALLBACK_PATH,
    }),
  });
}

function parseStart(value: unknown): ChatGptAuthStart {
  if (!isRecord(value)) {
    throw new Error("ChatGPT provider returned an invalid sign-in attempt");
  }
  const attemptId = boundedOpaque(value.attempt_id, 16, 256);
  const state = boundedOpaque(value.state, 16, 512);
  if (
    !attemptId ||
    !state ||
    typeof value.authorization_url !== "string" ||
    value.authorization_url.length > 16_384
  ) {
    throw new Error("ChatGPT provider returned an invalid sign-in attempt");
  }
  return {
    attempt_id: attemptId,
    state,
    authorization_url: value.authorization_url,
  };
}

function parseStatus(value: unknown): ChatGptSubscriptionStatus {
  if (
    !isRecord(value) ||
    typeof value.configured !== "boolean" ||
    typeof value.signed_in !== "boolean" ||
    typeof value.ready !== "boolean" ||
    typeof value.signing_in !== "boolean"
  ) {
    throw new Error("ChatGPT provider returned an invalid status");
  }
  const expiresAt =
    value.expires_at === undefined
      ? undefined
      : typeof value.expires_at === "number" &&
          Number.isSafeInteger(value.expires_at) &&
          value.expires_at >= 0
        ? value.expires_at
        : null;
  if (expiresAt === null) {
    throw new Error("ChatGPT provider returned an invalid status");
  }

  const account =
    value.account === undefined ? undefined : parseAccount(value.account);
  return {
    configured: value.configured,
    signed_in: value.signed_in,
    ready: value.ready,
    signing_in: value.signing_in,
    ...(expiresAt !== undefined ? { expires_at: expiresAt } : {}),
    ...(account ? { account } : {}),
  };
}

function parseAccount(value: unknown): ChatGptSubscriptionAccount {
  if (!isRecord(value)) {
    throw new Error("ChatGPT provider returned an invalid status");
  }
  const id = optionalBoundedString(value.id);
  const email = optionalBoundedString(value.email);
  const plan = optionalBoundedString(value.plan);
  if (id === null || email === null || plan === null) {
    throw new Error("ChatGPT provider returned an invalid status");
  }
  return {
    ...(id ? { id } : {}),
    ...(email ? { email } : {}),
    ...(plan ? { plan } : {}),
  };
}

function optionalBoundedString(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && Buffer.byteLength(trimmed) <= 1_024
    ? trimmed
    : null;
}

function boundedOpaque(
  value: unknown,
  minimum: number,
  maximum: number
): string | null {
  return typeof value === "string" &&
    value.length >= minimum &&
    value.length <= maximum &&
    /^[A-Za-z0-9._~-]+$/.test(value)
    ? value
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function safeErrorCode(response: Response): Promise<string | null> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    return null;
  }
  if (!isRecord(value) || typeof value.code !== "string") return null;
  return /^[a-z0-9_]{1,128}$/.test(value.code) ? value.code : null;
}

function safeCoordinatorError(error: unknown): Error {
  if (error instanceof Error) {
    const message = error.message;
    if (
      message.startsWith("ChatGPT ") ||
      message.startsWith("OAuth loopback ")
    ) {
      return error;
    }
  }
  return new Error("ChatGPT sign-in could not be completed");
}
