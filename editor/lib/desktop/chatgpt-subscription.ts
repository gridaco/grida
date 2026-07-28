/**
 * GRIDA-SEC-008 — epoch-order the renderer's secret-free provider status.
 *
 * Renderer-side, secret-free state for the native ChatGPT provider.
 *
 * OAuth and token custody live in Electron main + the agent sidecar. This
 * module only caches the status DTO exposed by the narrow Desktop bridge so
 * onboarding, settings, and new-chat provider selection share one truth.
 */

import {
  chatgpt as chatgptBridge,
  type ChatGptSubscriptionStatus,
} from "@/lib/desktop/bridge";

export type ChatGptSubscriptionState =
  | { kind: "unsupported" }
  | { kind: "loading" }
  | { kind: "ready"; status: ChatGptSubscriptionStatus }
  | { kind: "error"; message: string };

const UNSUPPORTED: ChatGptSubscriptionState = { kind: "unsupported" };
const LOADING: ChatGptSubscriptionState = { kind: "loading" };

let cached: ChatGptSubscriptionState | null = null;
let operationEpoch = 0;
let readInFlight:
  | {
      epoch: number;
      promise: Promise<ChatGptSubscriptionState>;
    }
  | undefined;
let mutationInFlight: Promise<ChatGptSubscriptionState> | undefined;
const listeners = new Set<() => void>();

export function isSupported(): boolean {
  return chatgptBridge.isSupported();
}

export function peek(): ChatGptSubscriptionState {
  if (cached) return cached;
  return isSupported() ? LOADING : UNSUPPORTED;
}

export function isReady(state: ChatGptSubscriptionState = peek()): boolean {
  return state.kind === "ready" && state.status.ready;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function refresh(): Promise<ChatGptSubscriptionState> {
  if (!isSupported()) return setCached(UNSUPPORTED);
  if (mutationInFlight) {
    try {
      return await mutationInFlight;
    } catch {
      return peek();
    }
  }
  const epoch = operationEpoch;
  if (readInFlight?.epoch === epoch) return await readInFlight.promise;
  const promise = readStatus().then((state) =>
    operationEpoch === epoch && !mutationInFlight ? setCached(state) : state
  );
  readInFlight = { epoch, promise };
  try {
    return await promise;
  } finally {
    if (readInFlight?.promise === promise) readInFlight = undefined;
  }
}

export async function connect(): Promise<ChatGptSubscriptionState> {
  if (!isSupported()) return setCached(UNSUPPORTED);
  return await mutate(async () => {
    const result = await chatgptBridge.connect();
    // Closing or cancelling the system-browser flow is a normal user choice.
    // Main owns the cancellation race and carries this stable outcome through
    // IPC; renderer behavior never depends on serialized Error prose.
    if (result.outcome === "cancelled") return await readStatus();
    return {
      kind: "ready",
      status: result,
    };
  });
}

export async function cancel(): Promise<void> {
  if (!isSupported()) return;
  await mutate(async () => {
    await chatgptBridge.cancel();
    return await readStatus();
  });
}

export async function signOut(): Promise<ChatGptSubscriptionState> {
  if (!isSupported()) return setCached(UNSUPPORTED);
  return await mutate(async () => {
    return {
      kind: "ready",
      status: await chatgptBridge.signOut(),
    };
  });
}

async function readStatus(): Promise<ChatGptSubscriptionState> {
  try {
    return {
      kind: "ready",
      status: await chatgptBridge.status(),
    };
  } catch (error) {
    return errorState(error);
  }
}

async function mutate(
  action: () => Promise<ChatGptSubscriptionState>
): Promise<ChatGptSubscriptionState> {
  const epoch = ++operationEpoch;
  let promise!: Promise<ChatGptSubscriptionState>;
  promise = action()
    .then((state) => {
      if (operationEpoch === epoch) setCached(state);
      return state;
    })
    .catch((error) => {
      if (operationEpoch === epoch) setCached(errorState(error));
      throw error;
    })
    .finally(() => {
      if (mutationInFlight === promise) mutationInFlight = undefined;
    });
  mutationInFlight = promise;
  return await promise;
}

function errorState(error: unknown): ChatGptSubscriptionState {
  return {
    kind: "error",
    message:
      error instanceof Error && error.message
        ? error.message
        : "Could not read ChatGPT sign-in status.",
  };
}

function setCached(state: ChatGptSubscriptionState): ChatGptSubscriptionState {
  cached = state;
  for (const listener of listeners) listener();
  return state;
}

/** Test-only reset for module-level cache/single-flight state. */
export function __unsafe_reset_for_tests(): void {
  cached = null;
  operationEpoch = 0;
  readInFlight = undefined;
  mutationInFlight = undefined;
  listeners.clear();
}
