// GRIDA-SEC-008 — host-only OAuth ceremony and subscription inference custody.
import { AuthStore } from "@grida/daemon/server";
import { Hono } from "hono";
import path from "node:path";
import { registerChatGptAuthRoutes } from "./http/routes/chatgpt-auth";
import { CHATGPT_AUTH_ROUTE_PATHS } from "./protocol/chatgpt";
import { ChatGptCredentialManager } from "./providers/chatgpt-credentials";
import {
  ChatGptProvider,
  type ChatGptProviderConfig,
  type ChatGptProviderRuntime,
} from "./providers/chatgpt";
import { ProviderHttp } from "./providers/http";

const MAX_CEREMONY_BYTES = 32 * 1024;
const CEREMONY_ROUTES = new Set<string>(
  Object.values(CHATGPT_AUTH_ROUTE_PATHS)
);

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
  private readonly ceremony = new Hono();
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
    const credentials = new ChatGptCredentialManager(
      new AuthStore(userDataPath),
      this.http,
      config.oauth
    );
    this.runtime = { config, credentials };
    registerChatGptAuthRoutes(this.ceremony, { credentials });
  }

  /** Invoke existing ceremony handlers in-process without opening an HTTP listener. */
  async ceremonyRequest(route: string, init?: RequestInit): Promise<Response> {
    if (this.closed) return new Response(null, { status: 503 });
    if (!CEREMONY_ROUTES.has(route)) return new Response(null, { status: 404 });
    if (
      init?.method !== "POST" ||
      typeof init.body !== "string" ||
      Buffer.byteLength(init.body) > MAX_CEREMONY_BYTES
    )
      return new Response(null, { status: 400 });
    return await this.track(
      Promise.resolve(this.ceremony.request(route, init))
    );
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

  private track<T>(task: Promise<T>): Promise<T> {
    this.inFlight.add(task);
    return task.finally(() => this.inFlight.delete(task));
  }
}
