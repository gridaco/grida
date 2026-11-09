// GRIDA-SEC-004 — renderer-safe native chat projection.
export type NativeChatAttachment = Readonly<{
  attachmentId: string;
  sessionId: string;
}>;

export type NativeChatTurn = Readonly<{
  turnId: string;
  epoch: number;
  journalPosition: number;
  historyPosition: number;
  controlRevision: number;
  paused: boolean;
  cancelled: boolean;
  disposition: "running" | "suspended" | "interrupted" | "settled";
  status: "succeeded" | "failed" | "cancelled" | "uncertain" | null;
}>;

export type NativeChatSnapshot = Readonly<{
  sessionId: string;
  sessionRevision: number;
  queuedInputs: number;
  admissionPaused: boolean;
  current: NativeChatTurn | null;
  latest: NativeChatTurn | null;
}>;

export type NativeChatObservation = Readonly<{
  observationId: string;
  snapshot: NativeChatSnapshot;
}>;

export type NativeChatAcceptance = Readonly<{
  sessionId: string;
  inputId: string;
  inputPosition: number;
  turnId: string | null;
  disposition: "queued" | "claimed" | "completed" | "superseded" | "withdrawn";
  replacementInputId?: string;
}>;

export type NativeChatControl = Readonly<{
  action: "pause" | "stop" | "resume";
  observationId: string;
  requestId: string;
}>;

export type NativeChatControlReceipt = Readonly<{
  sessionId: string;
  turnId: string;
  requestId: string;
  sessionRevision: number;
  journalPosition: number;
}>;

export type NativeChatControlResult =
  | { action: "pause" | "stop"; receipt: NativeChatControlReceipt }
  | { action: "resume"; turn: NativeChatTurn };

export type NativeChatTextUpdate = Readonly<{
  kind: "text";
  role: "user" | "assistant";
  messageId: string;
  text: string;
  turnId: string;
  offsetBytes: number;
  replace: boolean;
}>;

export type NativeChatStreamUpdate =
  | NativeChatTextUpdate
  | Readonly<{ kind: "resync" }>;

export type NativeChatUpdate =
  | NativeChatStreamUpdate
  | Readonly<{
      kind: "closed";
      reason: "delivery_limit";
    }>;

/** Available only for a main-selected native chat in the current workspace. */
export type DesktopNativeChat = {
  available(): Promise<boolean>;
  create(): Promise<NativeChatAttachment>;
  load(sessionId: string): Promise<NativeChatAttachment>;
  detach(attachmentId: string): Promise<void>;
  submit(
    attachmentId: string,
    inputId: string,
    text: string
  ): Promise<NativeChatAcceptance>;
  inputReceipt(
    attachmentId: string,
    inputId: string
  ): Promise<NativeChatAcceptance>;
  observe(attachmentId: string): Promise<NativeChatObservation>;
  control(
    attachmentId: string,
    control: NativeChatControl
  ): Promise<NativeChatControlResult>;
  subscribe(
    attachmentId: string,
    update: (update: NativeChatUpdate) => void
  ): Promise<string>;
  unsubscribe(subscriptionId: string): Promise<void>;
};
