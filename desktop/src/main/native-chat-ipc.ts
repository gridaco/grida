// GRIDA-SEC-004 — native chat attachments and delivery belong to the admitted frame.
import { randomUUID } from "node:crypto";
import type { IpcMainInvokeEvent, WebContents, WebFrameMain } from "electron";
import type {
  NativeChatAttachment,
  NativeChatControlResult,
  NativeChatObservation,
  NativeChatPage,
  NativeChatReadiness,
  NativeChatSnapshot,
  NativeChatUpdate,
} from "@grida/desktop-bridge";
import { IPC_CHANNELS } from "../bridge/contract";
import { ipc_sender } from "./ipc-sender";
import type { NativeAgentChat, NativeChatSession } from "./native-agent-chat";

const MAX_ATTACHMENTS = 16;
const MAX_OBSERVATIONS = 16;
const MAX_SUBSCRIPTIONS = 8;
const MAX_UPDATE_BYTES = 8 * 1024;
const MAX_DELIVERY_BYTES = 1024 * 1024;
const MAX_DELIVERY_CHUNKS = 4096;
const TOKEN = /^[a-f0-9-]{36}$/;

export type ActiveNativeChat = Readonly<{
  workspaceId: string;
  chat: Pick<
    NativeAgentChat,
    | "list"
    | "create"
    | "load"
    | "submit"
    | "inputReceipt"
    | "observe"
    | "transcript"
    | "pause"
    | "stop"
    | "resume"
    | "subscribe"
  >;
}>;

type Attachment = {
  id: string;
  session: NativeChatSession;
  observations: Map<string, NativeChatSnapshot>;
};

type Subscription = { attachment: Attachment; stop(): void };

type Owner = {
  sender: WebContents;
  frame: WebFrameMain;
  active: ActiveNativeChat;
  attachments: Map<string, Attachment>;
  subscriptions: Map<string, Subscription>;
  pending: number;
  listing: boolean;
  release(): void;
};

type Startup = {
  frame: WebFrameMain;
  workspaceId: string;
  result: Promise<NativeChatReadiness>;
  release(): void;
};

export class NativeChatIpc {
  private readonly owners = new Map<WebContents, Owner>();
  private readonly startups = new WeakMap<WebContents, Startup>();

  constructor(
    private readonly editorOrigin: string,
    private readonly resolve: (sender: WebContents) => ActiveNativeChat | null,
    private readonly startup?: {
      admits(sender: WebContents): boolean;
      ensure(workspaceId: string): Promise<void>;
    }
  ) {}

  available(event: IpcMainInvokeEvent): boolean | Promise<boolean> {
    if (!this.startup)
      return this.scope(event.sender, event.senderFrame) !== null;
    return this.status(event, true).then((state) => {
      if (state !== "native-ready") throw new Error("native_chat_unavailable");
      return true;
    });
  }

  async status(
    { sender, senderFrame: frame }: IpcMainInvokeEvent,
    start = false
  ): Promise<NativeChatReadiness> {
    if (typeof start !== "boolean")
      throw new Error("native_chat_start_invalid");
    const workspaceId = this.workspaceId(sender, frame);
    if (!frame || !workspaceId) throw new Error("native_chat_scope_changed");
    if (this.resolve(sender)?.workspaceId === workspaceId)
      return "native-ready";
    const startup = this.startup;
    if (!startup) return "legacy";
    if (!start) return "native-starting";

    const existing = this.startups.get(sender);
    if (existing?.frame === frame && existing.workspaceId === workspaceId)
      return existing.result;
    existing?.release();

    const requireCurrent = () => {
      if (
        this.startups.get(sender) !== pending ||
        this.workspaceId(sender, frame) !== workspaceId
      )
        throw new Error("native_chat_scope_changed");
    };
    const release = () => {
      if (this.startups.get(sender) === pending) this.startups.delete(sender);
      stopWatching();
    };
    const stopWatching = watchNavigation(sender, release);
    const pending: Startup = {
      frame,
      workspaceId,
      release,
      result: Promise.resolve()
        .then(async () => {
          requireCurrent();
          try {
            await startup.ensure(workspaceId);
          } catch {
            requireCurrent();
            return "native-unavailable";
          }
          requireCurrent();
          return this.resolve(sender)?.workspaceId === workspaceId
            ? "native-ready"
            : "native-unavailable";
        })
        .finally(release),
    };
    this.startups.set(sender, pending);
    return pending.result;
  }

  async list(
    event: IpcMainInvokeEvent,
    cursor?: string | null
  ): Promise<NativeChatPage> {
    const owner = this.owner(event);
    if (owner.listing) throw new Error("native_chat_catalog_busy");
    owner.listing = true;
    try {
      const page = await owner.active.chat.list(cursor);
      this.revalidate(owner);
      return page;
    } finally {
      owner.listing = false;
    }
  }

  create(event: IpcMainInvokeEvent): Promise<NativeChatAttachment> {
    return this.attach(event, (chat) => chat.create());
  }

  load(
    event: IpcMainInvokeEvent,
    sessionId: string
  ): Promise<NativeChatAttachment> {
    return this.attach(event, (chat) => chat.load(sessionId));
  }

  detach(event: IpcMainInvokeEvent, attachmentId: string): void {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    owner.attachments.delete(attachment.id);
    for (const [id, subscription] of owner.subscriptions) {
      if (subscription.attachment === attachment)
        this.unsubscribeOwned(owner, id);
    }
  }

  async submit(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    inputId: string,
    text: string
  ) {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const result = await owner.active.chat.submit(
      attachment.session,
      inputId,
      text
    );
    this.revalidate(owner, attachment);
    return result;
  }

  async inputReceipt(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    inputId: string
  ) {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const result = await owner.active.chat.inputReceipt(
      attachment.session,
      inputId
    );
    this.revalidate(owner, attachment);
    return result;
  }

  async observe(
    event: IpcMainInvokeEvent,
    attachmentId: string
  ): Promise<NativeChatObservation> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const snapshot = await owner.active.chat.observe(attachment.session);
    this.revalidate(owner, attachment);
    for (const [id, observed] of attachment.observations) {
      if (sameBasis(snapshot, observed)) return { observationId: id, snapshot };
    }
    const oldest = attachment.observations.keys().next().value;
    if (oldest && attachment.observations.size >= MAX_OBSERVATIONS)
      attachment.observations.delete(oldest);
    const observationId = randomUUID();
    attachment.observations.set(observationId, snapshot);
    return { observationId, snapshot };
  }

  async transcript(event: IpcMainInvokeEvent, attachmentId: string) {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const messages = await owner.active.chat.transcript(attachment.session);
    this.revalidate(owner, attachment);
    return messages;
  }

  async control(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    input: unknown
  ): Promise<NativeChatControlResult> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const control = record(input);
    const action = control?.action;
    if (
      (action !== "pause" && action !== "stop" && action !== "resume") ||
      !token(control?.observationId) ||
      typeof control?.requestId !== "string"
    )
      throw new Error("native_chat_control_invalid");
    const snapshot = attachment.observations.get(control.observationId);
    if (!snapshot) throw new Error("native_chat_observation_unavailable");
    const { chat } = owner.active;
    const result =
      action === "resume"
        ? ({
            action,
            turn: await chat.resume(
              attachment.session,
              snapshot,
              control.requestId
            ),
          } as const)
        : ({
            action,
            receipt: await chat[action](
              attachment.session,
              snapshot,
              control.requestId
            ),
          } as const);
    this.revalidate(owner, attachment);
    return result;
  }

  subscribe(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    subscriptionId: string
  ): void {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    if (
      !token(subscriptionId) ||
      owner.subscriptions.has(subscriptionId) ||
      owner.subscriptions.size >= MAX_SUBSCRIPTIONS
    )
      throw new Error("native_chat_subscription_unavailable");
    const subscription: Subscription = { attachment, stop: () => {} };
    owner.subscriptions.set(subscriptionId, subscription);
    let delivered = 0;
    let chunks = 0;
    try {
      const stop = owner.active.chat.subscribe(attachment.session, (update) => {
        if (owner.subscriptions.get(subscriptionId) !== subscription) return;
        try {
          this.revalidate(owner, attachment);
          const bytes =
            update.kind === "text" ? Buffer.byteLength(update.text) : 0;
          if (bytes > MAX_UPDATE_BYTES) return;
          delivered += bytes;
          const limited =
            ++chunks > MAX_DELIVERY_CHUNKS || delivered > MAX_DELIVERY_BYTES;
          if (limited) this.unsubscribeOwned(owner, subscriptionId);
          const payload: NativeChatUpdate = limited
            ? { kind: "closed", reason: "delivery_limit" }
            : update;
          owner.frame.send(IPC_CHANNELS.NATIVE_CHAT_UPDATE, {
            subscriptionId,
            attachmentId,
            update: payload,
          });
        } catch {
          this.unsubscribeOwned(owner, subscriptionId);
        }
      });
      if (owner.subscriptions.get(subscriptionId) === subscription)
        subscription.stop = stop;
      else stop();
    } catch (error) {
      this.unsubscribeOwned(owner, subscriptionId);
      throw error;
    }
  }

  unsubscribe(event: IpcMainInvokeEvent, id: string): void {
    const owner = this.owners.get(event.sender);
    if (
      !owner ||
      owner.frame !== event.senderFrame ||
      !token(id) ||
      !owner.subscriptions.has(id)
    )
      throw new Error("native_chat_subscription_unavailable");
    this.revalidate(owner);
    this.unsubscribeOwned(owner, id);
  }

  private async attach(
    event: IpcMainInvokeEvent,
    open: (chat: ActiveNativeChat["chat"]) => Promise<NativeChatSession>
  ): Promise<NativeChatAttachment> {
    const owner = this.owner(event);
    if (owner.pending + owner.attachments.size >= MAX_ATTACHMENTS)
      throw new Error("native_chat_attachment_limit");
    owner.pending += 1;
    try {
      const session = await open(owner.active.chat);
      this.revalidate(owner);
      const existing = [...owner.attachments.values()].find(
        (entry) => entry.session === session
      );
      const attachment = existing ?? {
        id: randomUUID(),
        session,
        observations: new Map(),
      };
      owner.attachments.set(attachment.id, attachment);
      return { attachmentId: attachment.id, sessionId: session.id };
    } finally {
      owner.pending -= 1;
    }
  }

  private owner(event: IpcMainInvokeEvent): Owner {
    const { sender, senderFrame: frame } = event;
    const active = this.scope(sender, frame);
    if (!frame || !active) throw new Error("native_chat_unavailable");
    const existing = this.owners.get(sender);
    if (
      existing &&
      existing.frame === frame &&
      sameActive(existing.active, active)
    )
      return existing;
    existing?.release();
    const owner: Owner = {
      sender,
      frame,
      active,
      attachments: new Map(),
      subscriptions: new Map(),
      pending: 0,
      listing: false,
      release: () => {
        if (this.owners.get(sender) !== owner) return;
        this.owners.delete(sender);
        stopWatching();
        for (const id of owner.subscriptions.keys())
          this.unsubscribeOwned(owner, id);
        owner.attachments.clear();
      },
    };
    this.owners.set(sender, owner);
    const stopWatching = watchNavigation(sender, owner.release);
    return owner;
  }

  private requireAttachment(
    event: IpcMainInvokeEvent,
    id: string
  ): { owner: Owner; attachment: Attachment } {
    const owner = this.owners.get(event.sender);
    const attachment = token(id) ? owner?.attachments.get(id) : undefined;
    if (!owner || owner.frame !== event.senderFrame || !attachment)
      throw new Error("native_chat_attachment_unavailable");
    this.revalidate(owner, attachment);
    return { owner, attachment };
  }

  private revalidate(owner: Owner, attachment?: Attachment): void {
    if (
      this.owners.get(owner.sender) !== owner ||
      (attachment && owner.attachments.get(attachment.id) !== attachment)
    )
      throw new Error("native_chat_attachment_unavailable");
    if (!sameActive(owner.active, this.scope(owner.sender, owner.frame))) {
      owner.release();
      throw new Error("native_chat_scope_changed");
    }
  }

  private unsubscribeOwned(owner: Owner, id: string): void {
    const subscription = owner.subscriptions.get(id);
    owner.subscriptions.delete(id);
    subscription?.stop();
  }

  private scope(
    sender: WebContents,
    frame: WebFrameMain | null
  ): ActiveNativeChat | null {
    const id = this.workspaceId(sender, frame);
    if (!id) return null;
    const active = this.resolve(sender);
    return active?.workspaceId === id ? active : null;
  }

  private workspaceId(
    sender: WebContents,
    frame: WebFrameMain | null
  ): string | null {
    if (
      !frame ||
      sender.isDestroyed() ||
      sender.isLoadingMainFrame() ||
      frame !== sender.mainFrame ||
      (this.startup && !this.startup.admits(sender))
    )
      return null;
    const raw = frame.url;
    if (!ipc_sender.isAllowed(raw, this.editorOrigin)) return null;
    const url = new URL(raw);
    if (url.pathname !== "/desktop/workspace") return null;
    const [id, duplicate] = url.searchParams.getAll("id");
    return id && id.length <= 1024 && duplicate === undefined ? id : null;
  }
}

function watchNavigation(sender: WebContents, release: () => void): () => void {
  const navigating = (details: { isMainFrame: boolean }) => {
    if (details.isMainFrame) release();
  };
  const inPage = (_event: unknown, _url: string, isMainFrame: boolean) => {
    if (isMainFrame) release();
  };
  sender.on("did-start-navigation", navigating);
  sender.on("did-navigate-in-page", inPage);
  sender.on("did-navigate", release);
  sender.once("destroyed", release);
  sender.once("render-process-gone", release);
  return () => {
    sender.off("did-start-navigation", navigating);
    sender.off("did-navigate-in-page", inPage);
    sender.off("did-navigate", release);
    sender.off("destroyed", release);
    sender.off("render-process-gone", release);
  };
}

function sameActive(
  left: ActiveNativeChat,
  right: ActiveNativeChat | null
): boolean {
  return left.chat === right?.chat && left.workspaceId === right.workspaceId;
}

function sameBasis(
  left: NativeChatSnapshot,
  right: NativeChatSnapshot
): boolean {
  return (
    left.sessionRevision === right.sessionRevision &&
    left.current?.turnId === right.current?.turnId &&
    left.current?.epoch === right.current?.epoch &&
    left.current?.journalPosition === right.current?.journalPosition &&
    left.current?.controlRevision === right.current?.controlRevision
  );
}

function token(value: unknown): value is string {
  return typeof value === "string" && TOKEN.test(value);
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
