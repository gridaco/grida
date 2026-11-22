// GRIDA-SEC-004 / GRIDA-SEC-014 — OpenAI project discovery stays in Main.
import { isChatModelIdentifier } from "@grida/ai/catalogue";
import { OPENAI_PROJECT_PROVIDER_ID } from "@grida/ai/providers";
import { ProviderCredentialStore } from "@grida/auth/providers";
import type { NativeProviderNetwork } from "./native-provider-egress";

const TIMEOUT_MS = 5_000;
const FRESH_MS = 30_000;
const RETRY_MS = 2_000;
const MAX_BYTES = 512 * 1024;

export class NativeOpenAiModels {
  private readonly store: ProviderCredentialStore;
  private entry?: {
    key: string;
    expires: number;
    pending: Promise<NativeOpenAiModels.Offer>;
    offer?: NativeOpenAiModels.Offer;
  };

  constructor(
    credentialHome: string,
    private readonly network: () => Promise<NativeProviderNetwork>
  ) {
    this.store = new ProviderCredentialStore({ home: credentialHome });
  }

  invalidate() {
    this.entry = undefined;
  }

  async offer(waitForDiscovery = true): Promise<NativeOpenAiModels.Offer> {
    try {
      const key = await this.store.read(OPENAI_PROJECT_PROVIDER_ID);
      if (!key) {
        this.invalidate();
        return { status: "missing" };
      }
      if (!/^[!-~]+$/.test(key.trim())) return { status: "keyRejected" };
      if (this.entry?.key !== key || this.entry.expires <= Date.now()) {
        const pending: Promise<NativeOpenAiModels.Offer> = this.load(key)
          .catch(() => ({ status: "unavailable" }) as const)
          .then((offer) => {
            if (this.entry?.pending === pending) {
              this.entry.offer = offer;
              this.entry.expires =
                Date.now() +
                (offer.status === "ready" && offer.models.size > 0
                  ? FRESH_MS
                  : RETRY_MS);
            }
            return offer;
          });
        this.entry = { key, pending, expires: Infinity };
      }
      const entry = this.entry;
      if (!waitForDiscovery && !entry.offer) return { status: "loading" };
      const offer = entry.offer ?? (await entry.pending);
      if (!(await this.isCurrent(key)) || this.entry !== entry)
        return { status: "unavailable" };
      return offer;
    } catch {
      return { status: "unavailable" };
    }
  }

  private isCurrent(key: string) {
    return this.store.admit(OPENAI_PROJECT_PROVIDER_ID, key, () => true);
  }

  private async load(key: string): Promise<NativeOpenAiModels.Offer> {
    const controller = new AbortController();
    const deadline = Promise.withResolvers<NativeOpenAiModels.Offer>();
    const timer = setTimeout(() => {
      controller.abort();
      deadline.resolve({ status: "unavailable" });
    }, TIMEOUT_MS);
    try {
      return await Promise.race([
        this.discover(key, controller.signal),
        deadline.promise,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async discover(
    key: string,
    signal: AbortSignal
  ): Promise<NativeOpenAiModels.Offer> {
    const network = await this.network();
    signal.throwIfAborted();
    if (!network.getOpenAiModels) return { status: "unavailable" };
    const headers = new Headers({
      authorization: `Bearer ${key.trim()}`,
      accept: "application/json",
    });
    let pending: Promise<Response | null> | undefined;
    const admitted = await this.store.admit(
      OPENAI_PROJECT_PROVIDER_ID,
      key,
      () => {
        if (signal.aborted) return false;
        pending = network.getOpenAiModels!(headers, signal);
        void pending.catch(() => {});
        return true;
      }
    );
    if (!admitted || !pending) return { status: "unavailable" };
    const response = await pending;
    if (!response) return { status: "unavailable" };
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      return {
        status:
          response.status === 401
            ? "keyRejected"
            : response.status === 403
              ? "modelsForbidden"
              : "unavailable",
      };
    }
    return {
      status: "ready",
      models: await readModels(response, signal),
      isCurrent: () => this.isCurrent(key),
    };
  }
}

export namespace NativeOpenAiModels {
  export type Issue = "keyRejected" | "modelsForbidden" | "unavailable";
  export type Offer =
    | { status: "missing" | "loading" | Issue }
    | {
        status: "ready";
        models: ReadonlySet<string>;
        isCurrent: () => Promise<boolean>;
      };
}

async function readModels(response: Response, signal: AbortSignal) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("openai_project_models_invalid");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) throw new Error("openai_project_models_invalid");
      chunks.push(value);
    }
    signal.throwIfAborted();
    const list = JSON.parse(Buffer.concat(chunks, bytes).toString("utf8"));
    if (list?.object !== "list" || !Array.isArray(list.data))
      throw new Error("openai_project_models_invalid");
    return new Set<string>(
      list.data
        .map((row: { id?: unknown } | null) => row?.id)
        .filter(isChatModelIdentifier)
    );
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
