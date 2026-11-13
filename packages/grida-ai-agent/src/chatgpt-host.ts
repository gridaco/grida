// GRIDA-SEC-008 — host-only OAuth ceremony and subscription inference custody.
import { AuthStore } from "@grida/daemon/server";
import path from "node:path";
import type {
  ChatGptAuthStart,
  ChatGptSubscriptionStatus,
} from "./protocol/chatgpt";
import {
  ChatGptCredentialError,
  ChatGptCredentialManager,
} from "./providers/chatgpt-credentials";
import {
  ChatGptProvider,
  type ChatGptProviderConfig,
  type ChatGptProviderRuntime,
} from "./providers/chatgpt";
import { ProviderHttp } from "./providers/http";

export type { ChatGptProviderConfig } from "./providers/chatgpt";

const MAX_CEREMONY_BYTES = 32 * 1024;

type HostOptions = Readonly<{
  userDataPath: string;
  configuration: ChatGptProviderConfig;
  post: (
    target: string,
    headers: Headers,
    body: Buffer,
    signal: AbortSignal
  ) => Promise<Response | null>;
}>;

/** One native process owns the ceremony and all subscription requests. */
export class ChatGptSubscriptionHost {
  private readonly credentials: ChatGptCredentialManager;
  private readonly runtime: ChatGptProviderRuntime;
  private readonly http: ProviderHttp;
  private readonly inFlight = new Set<Promise<unknown>>();
  private closed = false;

  constructor({ userDataPath, configuration, post }: HostOptions) {
    if (
      !path.isAbsolute(userDataPath) ||
      path.resolve(userDataPath) !== userDataPath
    )
      throw new Error("chatgpt_host_directory_invalid");
    const config = structuredClone(configuration);
    ChatGptProvider.validate(config);
    const token = new URL(config.oauth.token_url).href;
    const responses = new URL(config.responses_url).href;
    this.http = new ProviderHttp({
      request: async (target, init) => {
        if (
          typeof target !== "string" ||
          init?.method !== "POST" ||
          !init.signal
        )
          throw new Error("chatgpt_host_request_invalid");
        const url = new URL(target).href;
        const body =
          url === token && init.body instanceof URLSearchParams
            ? Buffer.from(init.body.toString())
            : url === responses && init.body instanceof ArrayBuffer
              ? Buffer.from(init.body)
              : null;
        if (!body) throw new Error("chatgpt_host_request_invalid");
        return (
          (await post(url, new Headers(init.headers), body, init.signal)) ??
          new Response(null, { status: 503 })
        );
      },
      download: async () => {
        throw new Error("chatgpt_host_download_unavailable");
      },
    });
    this.credentials = new ChatGptCredentialManager(
      new AuthStore(userDataPath),
      this.http,
      config.oauth
    );
    this.runtime = { config, credentials: this.credentials };
  }

  /** Mint PKCE state for one sign-in through the given loopback callback. */
  start(redirectUri: string): Promise<ChatGptAuthStart> {
    return this.ceremony([redirectUri], () =>
      this.credentials.start(redirectUri)
    );
  }

  /** Exchange one callback code for the exact pending attempt. */
  complete(input: {
    attempt_id: string;
    code: string;
    state: string;
  }): Promise<ChatGptSubscriptionStatus> {
    const { attempt_id, code, state } = input;
    return this.ceremony([attempt_id, code, state], () =>
      this.credentials.complete({ attempt_id, code, state })
    );
  }

  cancel(attemptId: string): Promise<boolean> {
    return this.ceremony([attemptId], () => this.credentials.cancel(attemptId));
  }

  status(): Promise<ChatGptSubscriptionStatus> {
    return this.ceremony([], () => this.credentials.status());
  }

  signOut(): Promise<void> {
    return this.ceremony([], () => this.credentials.signOut());
  }

  async capture(modelId: string) {
    if (this.closed) throw new Error("chatgpt_host_closed");
    const connection = await ChatGptProvider.captureNative(
      this.runtime,
      modelId,
      this.http
    );
    return Object.freeze({
      ...connection,
      request: (body: Uint8Array, signal: AbortSignal) =>
        this.closed
          ? Promise.resolve(null)
          : this.track(connection.request(body, signal)),
    });
  }

  /** The supervisor closes its work admission before joining owned custody. */
  async drain(): Promise<void> {
    await Promise.allSettled(this.inFlight);
  }

  close(): Promise<void> {
    this.closed = true;
    return this.drain();
  }

  /** Bounded, non-empty string inputs; closed hosts admit no ceremony work. */
  private ceremony<T>(
    inputs: readonly string[],
    run: () => Promise<T>
  ): Promise<T> {
    if (this.closed) return Promise.reject(new Error("chatgpt_host_closed"));
    if (
      inputs.some((value) => typeof value !== "string" || value.length === 0) ||
      inputs.reduce((bytes, value) => bytes + Buffer.byteLength(value), 0) >
        MAX_CEREMONY_BYTES
    )
      return Promise.reject(
        new ChatGptCredentialError("chatgpt_oauth_attempt_invalid")
      );
    return this.track(run());
  }

  private track<T>(task: Promise<T>): Promise<T> {
    this.inFlight.add(task);
    return task.finally(() => this.inFlight.delete(task));
  }
}
