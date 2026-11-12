// GRIDA-SEC-004 — native chat attachments and delivery belong to the admitted frame.
import { randomUUID } from "node:crypto";
import type { IpcMainInvokeEvent, WebContents, WebFrameMain } from "electron";
import type { WorkspaceDirectoryIdentity } from "@grida/daemon/server";
import type { WorkspaceMediaGrant } from "./workspace-media-registry";
import type { NativeNestedDeckGrant } from "./native-workspace-catalog";
import {
  NativeEditorSurfaces,
  NativeEditorSvgText,
  type NativeEditorSurfaceSnapshot,
} from "@grida/desktop-bridge";
import { NativeEditorSvgTextReplies } from "./native-editor-svg-text-replies";
import { NativeDocumentIdentityBusy } from "./native-document-files";
import type {
  NativeChatAcceptance,
  NativeChatAttachment,
  NativeChatApproval,
  NativeChatCatalogEntry,
  NativeChatCommand,
  NativeChatCommandResult,
  NativeChatConfigurationInput,
  NativeChatControlReceipt,
  NativeChatEffort,
  NativeChatGoalObservation,
  NativeChatGoalReceipt,
  NativeChatImageArtifact,
  NativeChatLibrarySelection,
  NativeChatArtifactSaveResult,
  NativeChatControlResult,
  NativeChatObservation,
  NativeChatOperatingRegime,
  NativeChatPage,
  NativeChatProfileCatalog,
  NativeChatProfileSelection,
  NativeChatQuestion,
  NativeChatQuestionAnswer,
  NativeChatQueueChange,
  NativeChatQueuePage,
  NativeChatQueueReceipt,
  NativeChatReadiness,
  NativeChatRevisionReceipt,
  NativeChatRevisionTarget,
  NativeChatSideAnswer,
  NativeChatSideContext,
  NativeChatSnapshot,
  NativeChatTurnSummary,
  NativeChatUpdate,
  NativeChatWakeup,
  NativeContextLimit,
  NativeContextLimitResult,
  NativeHookInfo,
  NativeHookInspection,
} from "@grida/desktop-bridge";
import { IPC_CHANNELS } from "../bridge/contract";
import { DesktopGatewayGrantUnavailable } from "./account-session";
import { ipc_sender } from "./ipc-sender";
import type {
  NativeAgentChat,
  NativeChatSession,
  NativeLibrarySelectionReview,
  NativeQuestionReview,
} from "./native-agent-chat";
import type { NativeApprovalReview } from "./native-agent-permissions";
import {
  NativeAgentGoals,
  type NativeGoalInspection,
} from "./native-agent-goals";
import type { NativeSideChat } from "./native-agent-side-chats";
import type {
  NativeEditorSurfaceLease,
  NativeEditorSurfaceSelection,
} from "./native-editor-surfaces";
import {
  contextLimitValue,
  type ContextLimitBasis,
} from "./native-agent-configuration";
import { NativeAgentDeletion } from "./native-agent-deletion";
import { NativeAgentWakeups } from "./native-agent-wakeups";
import { RetainedFileExport } from "./retained-file-export";
import { NativeChatProfiles } from "./native-chat-profiles";

const MAX_ATTACHMENTS = 16;
const MAX_OBSERVATIONS = 16;
const MAX_REVIEWS = 16;
const MAX_SUBSCRIPTIONS = 8;
const MAX_UPDATE_BYTES = 8 * 1024;
const MAX_DELIVERY_BYTES = 1024 * 1024;
const MAX_DELIVERY_CHUNKS = 4096;
const MAX_CONFIGURATION_MESSAGE_BYTES = 1024;
const TOKEN = /^[a-f0-9-]{36}$/;

export type ActiveNativeChat = Readonly<{
  workspaceId: string;
  directoryIdentity?: WorkspaceDirectoryIdentity;
  chat: Pick<
    NativeAgentChat,
    | "list"
    | "catalogEntry"
    | "organize"
    | "create"
    | "load"
    | "openSideChat"
    | "askSideChat"
    | "closeSideChat"
    | "submit"
    | "enqueue"
    | "acceptsPng"
    | "submitImage"
    | "acceptsFile"
    | "submitFile"
    | "inspectContextLimit"
    | "updateContextLimit"
    | "sendConfiguration"
    | "inputReceipt"
    | "observe"
    | "turnSummary"
    | "queue"
    | "queuedText"
    | "editQueue"
    | "steer"
    | "goal"
    | "startGoal"
    | "controlGoal"
    | "approvals"
    | "answerApproval"
    | "questions"
    | "answerQuestion"
    | "transcript"
    | "transcriptPage"
    | "pause"
    | "stop"
    | "resume"
    | "subscribe"
  > &
    Partial<
      Pick<
        NativeAgentChat,
        | "acceptsSavedChatDeletion"
        | "deleteSavedChat"
        | "previewSavedChatDeletion"
        | "ownsSession"
        | "commands"
        | "runCommand"
        | "prepareRevision"
        | "revise"
        | "listSubagents"
        | "inspectSubagent"
        | "createSubagent"
        | "assignSubagent"
        | "stopSubagent"
        | "controlSubagentTurn"
        | "controlSubagentChild"
        | "readArtifact"
        | "acceptsWakeups"
        | "acceptsLibrarySelection"
        | "submitWithLibrarySelection"
        | "librarySelections"
        | "answerLibrarySelection"
        | "acceptsEffort"
        | "acceptsGoalEffort"
        | "submitWithWakeup"
        | "scheduledWakeup"
        | "controlWakeup"
        | "registerEditorSurfaces"
        | "inspectHooks"
        | "reviewHook"
        | "installHook"
        | "removeHook"
      >
    >;
}>;

type Attachment = {
  id: string;
  session: NativeChatSession;
  latestObservation?: NativeChatSnapshot;
  observations: Map<string, NativeChatSnapshot>;
  approvals: Map<string, NativeApprovalReview>;
  questions: Map<string, NativeQuestionReview>;
  librarySelections: Map<string, NativeLibrarySelectionReview>;
  goals: Map<string, NativeGoalInspection>;
  artifacts?: { turnId: string; items: readonly NativeChatImageArtifact[] };
  readingArtifact?: boolean;
  deletion?: ReviewedDeletion;
  editorSurfaces?: NativeEditorSurfaceLease;
  deckEditorSurface?: NativeEditorSurfaceSnapshot;
  side?: SideAttachment;
  reviewedConfiguration?: {
    input: NativeChatConfigurationInput;
    approved: boolean;
    request?: Promise<NativeChatAcceptance>;
    accepted?: NativeChatAcceptance;
  };
  closingSide?: Promise<void>;
};

type ReviewedDeletion = {
  requestId: string;
  snapshot: NativeChatSnapshot;
  catalogRevision: number;
  expectedOwnedChildren?: readonly number[];
};

type SideAttachment = {
  openId: string;
  nativeRequestId: string;
  opening?: Promise<NativeSideChat>;
  chat?: NativeSideChat;
  unconfirmed: boolean;
};

type Subscription = { attachment: Attachment; stop(): void };

type Owner = {
  sender: WebContents;
  frame: WebFrameMain;
  href: string;
  active: ActiveNativeChat;
  attachments: Map<string, Attachment>;
  retired: Set<string>;
  subscriptions: Map<string, Subscription>;
  pending: number;
  listing: boolean;
  reviewingConfiguration?: boolean;
  reviewingHooks?: boolean;
  contextLimit?: {
    id: string;
    basis: ContextLimitBasis;
    write?: { limit: number | null; result: Promise<NativeContextLimitResult> };
  };
  release(): void;
};

export type ConfigurationReview =
  | { kind: "limit"; limit: number | null }
  | { kind: "message"; text: string };

type Startup = {
  frame: WebFrameMain;
  href: string;
  workspaceId: string;
  result: Promise<NativeChatReadiness>;
  release(): void;
};

export type NativeChatProfileOwner = Readonly<{
  list(workspaceId: string): Promise<Omit<NativeChatProfileCatalog, "active">>;
  select(
    workspaceId: string,
    selection: NativeChatProfileSelection,
    requireCurrent: () => void
  ): Promise<void>;
}>;

type SelectedProfile = Readonly<{
  id: string;
  frame: WebFrameMain;
  href: string;
  workspaceId: string;
  release(): void;
}>;

type DeckFrame = {
  frame: WebFrameMain;
  href: string;
  workspaceId: string;
  identity?: WorkspaceDirectoryIdentity;
  recheck(): Promise<void>;
  release(): void;
};

type DocumentFrame = {
  frame: WebFrameMain;
  href: string;
  key?: string;
  recheck(): Promise<void>;
  release(): void;
};

type NestedDeckFrame = {
  frame: WebFrameMain;
  href: string;
  parentWorkspaceId: string;
  grant?: NativeNestedDeckGrant;
  recheck(): Promise<void>;
  release(): void;
};

export type NativeChatNestedDeckOwner = Readonly<{
  grant(
    parentWorkspaceId: string,
    relativePath: string
  ): Promise<NativeNestedDeckGrant>;
  current(parentWorkspaceId: string, key: string): ActiveNativeChat | null;
  ensure(
    grant: NativeNestedDeckGrant,
    requireCurrent: () => Promise<void>
  ): Promise<void>;
  close(key: string): Promise<void>;
}>;

export type NativeChatDocumentOwner = Readonly<{
  identity(
    sender: WebContents,
    docId: string,
    owner: { signal: AbortSignal; check(): void }
  ): Promise<string>;
  current(key: string): ActiveNativeChat | null;
  ensure(key: string, requireCurrent: () => void): Promise<void>;
  close(key: string): Promise<void>;
}>;

const DOCUMENT_SURFACE = "/canvas.svg";

export class NativeChatIpc {
  private readonly owners = new Map<WebContents, Owner>();
  private readonly deckFrames = new Map<WebContents, DeckFrame>();
  private readonly nestedDeckFrames = new Map<WebContents, NestedDeckFrame>();
  private readonly documentFrames = new Map<WebContents, DocumentFrame>();
  private readonly startups = new Map<WebContents, Startup>();
  private readonly deleting = new WeakSet<NativeChatSession>();
  private readonly savingArtifact = new WeakSet<WebContents>();
  private readonly selectedProfiles = new WeakMap<
    WebContents,
    SelectedProfile
  >();
  private readonly selectingProfile = new WeakSet<WebContents>();
  private readonly svgTextReplies = new NativeEditorSvgTextReplies();

  constructor(
    private readonly editorOrigin: string,
    private readonly resolve: (
      sender: WebContents,
      workspaceId: string,
      profileId?: string
    ) => ActiveNativeChat | null,
    private readonly startup?: {
      admits(sender: WebContents): boolean;
      ensure(workspaceId: string): Promise<void>;
    },
    private readonly confirmConfiguration?: (
      sender: WebContents,
      review: ConfigurationReview
    ) => Promise<boolean>,
    private readonly confirmDeletion?: (
      sender: WebContents,
      title: string | null,
      ownedChildren?: number
    ) => Promise<boolean>,
    private readonly selectArtifactDestination?: (
      sender: WebContents
    ) => Promise<string | null>,
    private readonly profilesOwner?: NativeChatProfileOwner,
    private readonly deckWorkspace?: (
      id: string
    ) => Promise<WorkspaceMediaGrant>,
    private readonly disabled = false,
    private readonly documents?: NativeChatDocumentOwner,
    private readonly nestedDecks?: NativeChatNestedDeckOwner,
    private readonly hookReview?: {
      choose(sender: WebContents): Promise<string | null>;
      confirm(
        sender: WebContents,
        definition: NativeHookInfo,
        workspace: string,
        action: "install" | "remove"
      ): Promise<boolean>;
    }
  ) {}

  async documentRequest<T>(
    { sender, senderFrame: frame }: IpcMainInvokeEvent,
    invoke: () => T
  ): Promise<Awaited<T>> {
    const href = frame?.url;
    const docId = ipc_sender.documentId(href);
    if (!frame || !href || !docId || !this.frameCurrent(sender, frame, href))
      throw new Error("native_chat_scope_changed");
    if (this.disabled) return await invoke();
    const documents = this.documents;
    if (!documents) throw new Error("native_chat_unavailable");
    const existing = this.documentFrames.get(sender);
    const binding =
      existing?.frame === frame && existing.href === href
        ? existing
        : this.bindDocument(sender, frame, href, docId, documents);
    await binding.recheck();
    const result = await invoke();
    await binding.recheck();
    return result;
  }

  private bindDocument(
    sender: WebContents,
    frame: WebFrameMain,
    href: string,
    docId: string,
    documents: NativeChatDocumentOwner
  ): DocumentFrame {
    this.documentFrames.get(sender)?.release();
    const controller = new AbortController();
    const check = () => {
      if (
        this.documentFrames.get(sender) !== binding ||
        !this.frameCurrent(sender, frame, href)
      )
        throw new Error("native_chat_scope_changed");
    };
    const binding: DocumentFrame = {
      frame,
      href,
      recheck: async () => {
        try {
          check();
          const key = await documents.identity(sender, docId, {
            signal: controller.signal,
            check,
          });
          check();
          if (binding.key && binding.key !== key)
            throw new Error("native_chat_scope_changed");
          binding.key = key;
        } catch (error) {
          if (error instanceof NativeDocumentIdentityBusy) throw error;
          binding.release();
          throw new Error("native_chat_scope_changed");
        }
      },
      release: () => {
        if (this.documentFrames.get(sender) !== binding) return;
        this.documentFrames.delete(sender);
        controller.abort();
        stopWatching();
        const owner = this.owners.get(sender);
        if (owner?.href === href) owner.release();
        const startup = this.startups.get(sender);
        if (startup?.href === href) startup.release();
        if (binding.key) void documents.close(binding.key).catch(() => {});
      },
    };
    const stopWatching = ipc_sender.watchNavigation(sender, binding.release);
    this.documentFrames.set(sender, binding);
    return binding;
  }

  private frameCurrent(sender: WebContents, frame: WebFrameMain, href: string) {
    return (
      frame.url === href &&
      !sender.isDestroyed() &&
      !sender.isLoadingMainFrame() &&
      frame === sender.mainFrame &&
      ipc_sender.isAllowed(href, this.editorOrigin) &&
      (!this.startup || this.startup.admits(sender))
    );
  }

  async deckRequest<T>(
    { sender, senderFrame: frame }: IpcMainInvokeEvent,
    invoke: () => T
  ): Promise<Awaited<T>> {
    const href = frame?.url;
    const nested = ipc_sender.nestedDeck(href);
    if (nested && frame && href && this.frameCurrent(sender, frame, href)) {
      if (!this.startup) return await invoke();
      const owner = this.nestedDecks;
      if (!owner) throw new Error("native_chat_unavailable");
      const binding =
        this.nestedDeckFrame(sender, frame) ??
        this.bindNestedDeck(sender, frame, href, nested, owner);
      await binding.recheck();
      const result = await invoke();
      await binding.recheck();
      return result;
    }
    const workspaceId = ipc_sender.rootDeckId(href);
    if (
      !frame ||
      !href ||
      !workspaceId ||
      !this.frameCurrent(sender, frame, href)
    )
      throw new Error("native_chat_scope_changed");
    if (!this.startup) return await invoke();
    if (!this.deckWorkspace) throw new Error("native_chat_unavailable");
    const binding = this.bindDeck(
      sender,
      frame,
      href,
      workspaceId,
      this.deckWorkspace
    );
    await binding.recheck();
    const result = await invoke();
    await binding.recheck();
    return result;
  }

  revokeWorkspace(workspaceId: string): void {
    for (const binding of this.deckFrames.values()) {
      if (binding.workspaceId === workspaceId) binding.release();
    }
    for (const binding of this.nestedDeckFrames.values()) {
      if (binding.parentWorkspaceId === workspaceId) binding.release();
    }
    for (const owner of this.owners.values()) {
      if (owner.active.workspaceId === workspaceId) owner.release();
    }
    for (const startup of this.startups.values()) {
      if (startup.workspaceId === workspaceId) startup.release();
    }
  }

  private bindNestedDeck(
    sender: WebContents,
    frame: WebFrameMain,
    href: string,
    {
      workspaceId: parentWorkspaceId,
      relativePath,
    }: NonNullable<ReturnType<typeof ipc_sender.nestedDeck>>,
    owner: NativeChatNestedDeckOwner
  ): NestedDeckFrame {
    this.nestedDeckFrames.get(sender)?.release();
    const checkFrame = () => {
      if (
        this.nestedDeckFrames.get(sender) !== binding ||
        !this.frameCurrent(sender, frame, href)
      )
        throw new Error("native_chat_scope_changed");
    };
    const binding: NestedDeckFrame = {
      frame,
      href,
      parentWorkspaceId,
      recheck: async () => {
        checkFrame();
        try {
          const grant = await owner.grant(parentWorkspaceId, relativePath);
          checkFrame();
          if (
            grant.parentWorkspaceId !== parentWorkspaceId ||
            (binding.grant && binding.grant.workspaceId !== grant.workspaceId)
          )
            throw new Error("native_chat_scope_changed");
          binding.grant ??= grant;
        } catch (error) {
          if (fileScopeBusy(error)) throw error;
          // A stale frame cannot revoke another frame's live grant. If the
          // same frame observed a retired generation, revoke all its users.
          if (
            binding.grant &&
            this.nestedDeckFrames.get(sender) === binding &&
            this.frameCurrent(sender, frame, href)
          ) {
            for (const current of this.nestedDeckFrames.values()) {
              if (current.grant?.workspaceId === binding.grant.workspaceId)
                current.release();
            }
          } else binding.release();
          throw new Error("native_chat_scope_changed");
        }
      },
      release: () => {
        if (this.nestedDeckFrames.get(sender) !== binding) return;
        this.nestedDeckFrames.delete(sender);
        stopWatching();
        const attached = this.owners.get(sender);
        if (attached?.href === href) attached.release();
        const startup = this.startups.get(sender);
        if (startup?.href === href) startup.release();
        const key = binding.grant?.workspaceId;
        if (
          key &&
          ![...this.nestedDeckFrames.values()].some(
            (other) => other.grant?.workspaceId === key
          )
        )
          void owner.close(key).catch(() => {});
      },
    };
    const stopWatching = ipc_sender.watchNavigation(sender, binding.release);
    this.nestedDeckFrames.set(sender, binding);
    return binding;
  }

  private bindDeck(
    sender: WebContents,
    frame: WebFrameMain,
    href: string,
    workspaceId: string,
    resolve: (id: string) => Promise<WorkspaceMediaGrant>
  ): DeckFrame {
    const existing = this.deckFrames.get(sender);
    if (existing?.frame === frame && existing.href === href) return existing;
    existing?.release();
    const binding: DeckFrame = {
      frame,
      href,
      workspaceId,
      recheck: async () => {
        const grant = await resolve(workspaceId).catch(() => null);
        if (
          this.deckFrames.get(sender) !== binding ||
          !this.frameCurrent(sender, frame, href) ||
          grant?.workspaceId !== workspaceId ||
          (binding.identity && !sameDirectory(binding.identity, grant.identity))
        ) {
          binding.release();
          throw new Error("native_chat_scope_changed");
        }
        binding.identity ??= grant.identity;
      },
      release: () => {
        if (this.deckFrames.get(sender) !== binding) return;
        this.deckFrames.delete(sender);
        stopWatching();
        const owner = this.owners.get(sender);
        if (owner?.href === href) owner.release();
        const startup = this.startups.get(sender);
        if (startup?.href === href) startup.release();
        const profile = this.selectedProfiles.get(sender);
        if (profile?.href === href) profile.release();
      },
    };
    const stopWatching = ipc_sender.watchNavigation(sender, binding.release);
    this.deckFrames.set(sender, binding);
    return binding;
  }

  available(event: IpcMainInvokeEvent): boolean | Promise<boolean> {
    if (this.disabled) return false;
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
    if (this.disabled) return "native-unavailable";
    const href = frame.url;
    if (this.scope(sender, frame)) return "native-ready";
    const startup = this.startup;
    if (!startup) return "legacy";
    if (!start) return "native-starting";

    const existing = this.startups.get(sender);
    if (existing?.frame === frame && existing.href === href)
      return existing.result;
    existing?.release();
    const document = this.documentFrame(sender, frame);
    const nested = this.nestedDeckFrame(sender, frame);
    const profile = this.profile(sender, frame, workspaceId);

    const requireCurrent = () => {
      if (
        this.startups.get(sender) !== pending ||
        frame.url !== href ||
        this.workspaceId(sender, frame) !== workspaceId ||
        this.profile(sender, frame, workspaceId) !== profile
      )
        throw new Error("native_chat_scope_changed");
    };
    const release = () => {
      if (this.startups.get(sender) === pending) this.startups.delete(sender);
      stopWatching();
    };
    const stopWatching = ipc_sender.watchNavigation(sender, release);
    const pending: Startup = {
      frame,
      href,
      workspaceId,
      release,
      result: Promise.resolve()
        .then(async () => {
          requireCurrent();
          try {
            if (document && this.documents) {
              await document.recheck();
              await this.documents.ensure(workspaceId, requireCurrent);
              await document.recheck();
            } else if (nested?.grant && this.nestedDecks) {
              await this.nestedDecks.ensure(nested.grant, async () => {
                requireCurrent();
                await nested.recheck();
                requireCurrent();
              });
              await nested.recheck();
            } else if (profile && this.profilesOwner)
              await this.profilesOwner.select(
                workspaceId,
                { kind: "saved", id: profile.id },
                requireCurrent
              );
            else await startup.ensure(workspaceId);
          } catch (error) {
            requireCurrent();
            // Forward only known recovery states. Startup errors can contain
            // private provider or host details.
            if (error instanceof DesktopGatewayGrantUnavailable)
              return "native-gateway-unavailable";
            switch (error instanceof Error ? error.message : null) {
              case "native_provider_byok_key_missing":
                return "native-provider-key-required";
              case "native_provider_model_unavailable":
                return "native-provider-model-unavailable";
              case "native_provider_endpoint_https_required":
                return "native-provider-endpoint-https-required";
              case "native_provider_endpoint_not_approved":
                return "native-provider-endpoint-approval-required";
              default:
                return "native-unavailable";
            }
          }
          requireCurrent();
          return this.scope(sender, frame)
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
    cursor?: string | null,
    archived = false
  ): Promise<NativeChatPage> {
    const owner = this.owner(event);
    if (owner.listing) throw new Error("native_chat_catalog_busy");
    owner.listing = true;
    try {
      const page = archived
        ? await owner.active.chat.list(cursor, true)
        : await owner.active.chat.list(cursor);
      this.revalidate(owner);
      return page;
    } finally {
      owner.listing = false;
    }
  }

  async profiles({
    sender,
    senderFrame: frame,
  }: IpcMainInvokeEvent): Promise<NativeChatProfileCatalog | null> {
    const owner = this.profilesOwner;
    if (
      !owner ||
      this.documentFrame(sender, frame) ||
      this.nestedDeckFrame(sender, frame)
    )
      return null;
    const workspaceId = this.workspaceId(sender, frame);
    if (!frame || !workspaceId) throw new Error("native_chat_scope_changed");
    const href = frame.url;
    const profile = this.profile(sender, frame, workspaceId);
    let admitted = true;
    const stopWatching = ipc_sender.watchNavigation(sender, () => {
      admitted = false;
    });
    try {
      const result = await owner.list(workspaceId);
      if (
        !admitted ||
        frame.url !== href ||
        this.workspaceId(sender, frame) !== workspaceId ||
        this.profile(sender, frame, workspaceId) !== profile
      )
        throw new Error("native_chat_scope_changed");
      return { ...result, active: profile?.id ?? null };
    } finally {
      stopWatching();
    }
  }

  async selectProfile(
    { sender, senderFrame: frame }: IpcMainInvokeEvent,
    selection: unknown
  ): Promise<void> {
    const owner = this.profilesOwner;
    const workspaceId = this.workspaceId(sender, frame);
    if (
      !owner ||
      !frame ||
      !workspaceId ||
      this.documentFrame(sender, frame) ||
      this.nestedDeckFrame(sender, frame)
    )
      throw new Error("native_chat_profiles_unavailable");
    const href = frame.url;
    const chosen = chatProfileSelection(selection);
    if (this.selectingProfile.has(sender))
      throw new Error("native_chat_profile_selection_busy");
    this.selectingProfile.add(sender);
    let admitted = true;
    const stopWatching = ipc_sender.watchNavigation(sender, () => {
      admitted = false;
    });
    const requireCurrent = () => {
      if (
        !admitted ||
        frame.url !== href ||
        this.workspaceId(sender, frame) !== workspaceId
      )
        throw new Error("native_chat_scope_changed");
    };
    try {
      await owner.select(workspaceId, chosen, requireCurrent);
      requireCurrent();
      const id = chosen.kind === "default" ? undefined : chosen.id;
      if (this.resolve(sender, workspaceId, id)?.workspaceId !== workspaceId)
        throw new Error("native_chat_profile_unavailable");
      const previous = this.profile(sender, frame, workspaceId);
      if (previous?.id === id) return;
      this.owners.get(sender)?.release();
      this.startups.get(sender)?.release();
      previous?.release();
      if (!id) return;
      const selected: SelectedProfile = {
        id,
        frame,
        href,
        workspaceId,
        release: () => {
          if (this.selectedProfiles.get(sender) !== selected) return;
          this.selectedProfiles.delete(sender);
          stopSelected();
        },
      };
      const stopSelected = ipc_sender.watchNavigation(sender, selected.release);
      this.selectedProfiles.set(sender, selected);
    } finally {
      stopWatching();
      this.selectingProfile.delete(sender);
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

  commands(
    event: IpcMainInvokeEvent,
    attachmentId: string
  ): readonly NativeChatCommand[] {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    return owner.active.chat.commands?.(attachment.session) ?? [];
  }

  async runCommand(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    command: unknown,
    requestId: unknown
  ): Promise<NativeChatCommandResult> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    if ((command !== "compact" && command !== "fork") || !token(requestId))
      throw new Error("native_chat_command_invalid");
    const chat = owner.active.chat;
    if (!chat.runCommand) throw new Error("native_chat_command_unavailable");
    const result = await chat.runCommand(
      attachment.session,
      command,
      requestId,
      () => this.revalidate(owner, attachment)
    );
    this.revalidate(owner, attachment);
    return result;
  }

  prepareRevision(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    observationId: unknown,
    messageId: unknown
  ): Promise<NativeChatRevisionTarget> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const snapshot = requireObservation(attachment, observationId);
    const chat = owner.active.chat;
    if (!chat.prepareRevision || typeof messageId !== "string")
      throw new Error("native_chat_revision_unavailable");
    return chat.prepareRevision(
      attachment,
      attachment.session,
      snapshot,
      messageId,
      (expected) => this.revalidateRevision(owner, attachment, expected)
    );
  }

  revise(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    value: unknown
  ): Promise<NativeChatRevisionReceipt> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const chat = owner.active.chat;
    const input = record(value);
    if (
      !chat.revise ||
      !input ||
      Object.keys(input).length !== (input.effort === undefined ? 3 : 4) ||
      !token(input.reviewId) ||
      typeof input.text !== "string" ||
      (input.operatingRegime !== "act" && input.operatingRegime !== "plan")
    )
      throw new Error("native_chat_revision_unavailable");
    const effort = agentEffort(input.effort);
    return chat.revise(
      attachment,
      attachment.session,
      {
        reviewId: input.reviewId,
        text: input.text,
        operatingRegime: input.operatingRegime,
        ...(effort && { effort }),
      },
      (expected) => this.revalidateRevision(owner, attachment, expected)
    );
  }

  listSubagents(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    afterChildId: unknown
  ) {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const chat = owner.active.chat;
    if (
      !chat.listSubagents ||
      (afterChildId !== undefined && typeof afterChildId !== "string")
    )
      throw new Error("native_chat_subagent_unavailable");
    return chat.listSubagents(attachment.session, afterChildId, () =>
      this.revalidate(owner, attachment)
    );
  }

  inspectSubagent(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    childId: unknown,
    inputId: unknown
  ) {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const chat = owner.active.chat;
    if (
      !chat.inspectSubagent ||
      typeof childId !== "string" ||
      (inputId !== undefined && typeof inputId !== "string")
    )
      throw new Error("native_chat_subagent_unavailable");
    return chat.inspectSubagent(
      attachment,
      attachment.session,
      childId,
      inputId,
      () => this.revalidate(owner, attachment)
    );
  }

  createSubagent(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    value: unknown
  ) {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const chat = owner.active.chat;
    const input = record(value);
    if (
      !chat.createSubagent ||
      !input ||
      Object.keys(input).length !== 3 ||
      !token(input.requestId) ||
      typeof input.name !== "string" ||
      typeof input.workTurns !== "number"
    )
      throw new Error("native_chat_subagent_invalid_input");
    return chat.createSubagent(
      attachment.session,
      {
        requestId: input.requestId,
        name: input.name,
        workTurns: input.workTurns,
      },
      () => this.revalidate(owner, attachment)
    );
  }

  assignSubagent(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    value: unknown
  ) {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const chat = owner.active.chat;
    const input = record(value);
    if (
      !chat.assignSubagent ||
      !input ||
      Object.keys(input).length !== 4 ||
      typeof input.childId !== "string" ||
      !token(input.parentObservationId) ||
      !token(input.inputId) ||
      typeof input.instructions !== "string"
    )
      throw new Error("native_chat_subagent_invalid_input");
    const assignment = {
      childId: input.childId,
      parentObservationId: input.parentObservationId,
      inputId: input.inputId,
      instructions: input.instructions,
    };
    return chat.assignSubagent(
      attachment,
      attachment.session,
      assignment,
      () => requireObservation(attachment, assignment.parentObservationId),
      () => this.revalidate(owner, attachment)
    );
  }

  stopSubagent(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    stopObservationId: unknown,
    requestId: unknown
  ) {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const chat = owner.active.chat;
    if (!chat.stopSubagent || !token(stopObservationId) || !token(requestId))
      throw new Error("native_chat_subagent_invalid_input");
    return chat.stopSubagent(
      attachment,
      attachment.session,
      stopObservationId,
      requestId,
      () => this.revalidate(owner, attachment)
    );
  }

  controlSubagentTurn(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    observationId: unknown,
    requestId: unknown,
    control: unknown
  ) {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const chat = owner.active.chat;
    if (!chat.controlSubagentTurn || !token(observationId) || !token(requestId))
      throw new Error("native_chat_subagent_invalid_input");
    return chat.controlSubagentTurn(
      attachment,
      attachment.session,
      observationId,
      requestId,
      control,
      () => this.revalidate(owner, attachment)
    );
  }

  controlSubagentChild(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    observationId: unknown,
    requestId: unknown,
    control: unknown
  ) {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const chat = owner.active.chat;
    if (
      !chat.controlSubagentChild ||
      !token(observationId) ||
      !token(requestId)
    )
      throw new Error("native_chat_subagent_invalid_input");
    return chat.controlSubagentChild(
      attachment,
      attachment.session,
      observationId,
      requestId,
      control,
      () => this.revalidate(owner, attachment)
    );
  }

  async catalogEntry(
    event: IpcMainInvokeEvent,
    attachmentId: string
  ): Promise<NativeChatCatalogEntry> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const entry = await owner.active.chat.catalogEntry(attachment.session);
    this.revalidate(owner, attachment);
    return this.deletableEntry(owner, entry);
  }

  async organize(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    change: unknown
  ): Promise<NativeChatCatalogEntry> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const entry = await owner.active.chat.organize(attachment.session, change);
    this.revalidate(owner, attachment);
    return this.deletableEntry(owner, entry);
  }

  async deleteSavedChat(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    observationId: unknown,
    catalogRevision: unknown
  ): Promise<boolean> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const chat = owner.active.chat;
    const session = attachment.session;
    const confirm = this.confirmDeletion;
    if (!confirm || !chat.acceptsSavedChatDeletion || !chat.deleteSavedChat)
      throw new Error("native_chat_deletion_unavailable");
    if (
      !token(observationId) ||
      typeof catalogRevision !== "number" ||
      !Number.isSafeInteger(catalogRevision) ||
      catalogRevision < 0
    )
      throw new Error("native_chat_deletion_invalid");
    if (this.deleting.has(session))
      throw new Error("native_chat_deletion_in_progress");
    this.deleting.add(session);
    try {
      let reviewed = attachment.deletion;
      const retry = !!reviewed;
      if (!reviewed) {
        const snapshot = requireObservation(attachment, observationId);
        if (snapshot.current || snapshot.queuedInputs)
          throw new Error("session_deletion_requires_idle");
        const entry = await chat.catalogEntry(session);
        this.revalidate(owner, attachment);
        if (
          entry.sessionId !== session.id ||
          entry.revision !== catalogRevision
        )
          throw new Error("session_catalog_revision_changed");
        const preview = await chat.previewSavedChatDeletion?.(session);
        const checkReview = () => {
          this.revalidate(owner, attachment);
          if (
            preview &&
            attachment.latestObservation?.sessionRevision !==
              snapshot.sessionRevision
          )
            throw new Error("stale_session_revision");
        };
        checkReview();
        const confirmed = await confirm(
          owner.sender,
          entry.title,
          ...(preview?.ownedChildren ? [preview.ownedChildren] : [])
        );
        if (!confirmed) {
          this.revalidate(owner, attachment);
          return false;
        }
        checkReview();
        reviewed = {
          requestId: randomUUID(),
          snapshot,
          catalogRevision,
          ...(preview && { expectedOwnedChildren: preview.ownedChildrenBasis }),
        };
        attachment.deletion = reviewed;
      }
      try {
        await chat.deleteSavedChat(
          session,
          reviewed.snapshot,
          reviewed.catalogRevision,
          reviewed.requestId,
          ...(reviewed.expectedOwnedChildren
            ? [reviewed.expectedOwnedChildren]
            : [])
        );
      } catch (error) {
        const pending =
          retry &&
          error instanceof Error &&
          (error.message === "session_deletion_in_progress" ||
            error.message === "session_deletion_observation_in_progress");
        if (!pending && !NativeAgentDeletion.isUnverified(error))
          attachment.deletion = undefined;
        throw error;
      }
      this.retireAttachments(owner.active, session);
      this.revalidate(owner);
      return true;
    } finally {
      this.deleting.delete(session);
    }
  }

  async openSideChat(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    openId: string
  ): Promise<NativeChatSideContext> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    if (
      !token(openId) ||
      attachment.closingSide ||
      (attachment.side && attachment.side.openId !== openId)
    )
      throw new Error("native_chat_side_open_unavailable");
    const side = (attachment.side ??= {
      openId,
      nativeRequestId: `side/${attachment.id}/${openId}`,
      unconfirmed: false,
    });
    const chat =
      side.chat ??
      (await (side.opening ??= owner.active.chat
        .openSideChat(attachment.session, side.nativeRequestId)
        .then((opened) => {
          side.chat = opened;
          side.unconfirmed = false;
          return opened;
        })
        .catch((error: unknown) => {
          side.opening = undefined;
          side.unconfirmed ||=
            error instanceof Error &&
            error.message === "native_agent_request_timeout";
          throw error;
        })));
    this.revalidate(owner, attachment);
    if (attachment.side !== side)
      throw new Error("native_chat_side_unavailable");
    return chat.context;
  }

  async askSideChat(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    openId: string,
    requestId: string,
    text: string
  ): Promise<NativeChatSideAnswer> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const side = attachment.side;
    if (!side?.chat || side.openId !== openId || !token(requestId))
      throw new Error("native_chat_side_unavailable");
    const answer = await owner.active.chat.askSideChat(
      attachment.session,
      side.chat,
      requestId,
      text
    );
    this.revalidate(owner, attachment);
    if (attachment.side !== side)
      throw new Error("native_chat_side_unavailable");
    return answer;
  }

  async closeSideChat(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    openId: string
  ): Promise<void> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    if (
      !token(openId) ||
      (attachment.side && attachment.side.openId !== openId)
    )
      throw new Error("native_chat_side_unavailable");
    await this.releaseSide(owner, attachment);
    this.revalidate(owner, attachment);
  }

  detach(event: IpcMainInvokeEvent, attachmentId: string): void {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    owner.attachments.delete(attachment.id);
    attachment.editorSurfaces?.close();
    void this.releaseSide(owner, attachment).catch(() => {});
    for (const [id, subscription] of owner.subscriptions) {
      if (subscription.attachment === attachment)
        this.unsubscribeOwned(owner, id);
    }
  }

  publishEditorSurfaces(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    value: unknown,
    revision?: unknown
  ): void {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const document = this.documentFrame(owner.sender, owner.frame);
    const rootDeck = this.deckFrames.get(owner.sender);
    const deck =
      this.nestedDeckFrame(owner.sender, owner.frame) ??
      (rootDeck?.frame === owner.frame && rootDeck.href === owner.href
        ? rootDeck
        : undefined);
    const file = document ?? deck;
    const snapshot = NativeEditorSurfaces.parse(value);
    if (
      !snapshot ||
      (revision !== undefined &&
        (typeof revision !== "number" ||
          !Number.isSafeInteger(revision) ||
          revision < 1))
    )
      throw new Error("native_chat_editor_surfaces_invalid");
    if (
      file &&
      (revision !== undefined ||
        snapshot.truncated ||
        (snapshot.active === null
          ? snapshot.open.length !== 0
          : snapshot.open.length !== 1 ||
            (document
              ? snapshot.active !== DOCUMENT_SURFACE
              : !snapshot.active.toLowerCase().endsWith(".svg"))))
    )
      throw new Error("native_chat_editor_surfaces_invalid");
    if (deck) attachment.deckEditorSurface = snapshot;
    if (attachment.editorSurfaces) {
      attachment.editorSurfaces.update(snapshot, revision);
    } else {
      attachment.editorSurfaces = owner.active.chat.registerEditorSurfaces?.(
        attachment.session,
        snapshot,
        () => this.revalidate(owner, attachment),
        file
          ? undefined
          : (request) =>
              owner.frame.send(IPC_CHANNELS.NATIVE_CHAT_EDITOR_SURFACE_OPEN, {
                attachmentId: attachment.id,
                ...request,
              }),
        revision,
        async (request) => {
          const slide = attachment.deckEditorSurface;
          if (deck && !slide?.active) return { kind: "unavailable" };
          if (file) await file.recheck();
          const result = await this.svgTextReplies.dispatch(
            attachment.id,
            request,
            () => {
              this.revalidate(owner, attachment);
              owner.frame.send(IPC_CHANNELS.NATIVE_CHAT_EDITOR_SVG_TEXT, {
                attachmentId: attachment.id,
                ...request,
              });
            }
          );
          if (file) await file.recheck();
          if (
            deck &&
            (attachment.deckEditorSurface !== slide ||
              ("path" in result && result.path !== slide?.active))
          )
            throw new Error("native_chat_svg_text_unverified");
          return result;
        }
      );
    }
  }

  replyEditorSvgText(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    callId: unknown,
    value: unknown
  ): void {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    if (this.documentFrame(owner.sender, owner.frame)) {
      const result = NativeEditorSvgText.result(value);
      if (result && "path" in result && result.path !== DOCUMENT_SURFACE)
        return this.svgTextReplies.respond(attachment.id, callId, null);
    }
    this.svgTextReplies.respond(attachment.id, callId, value);
  }

  async submit(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    inputId: string,
    text: string,
    regime?: unknown,
    effort?: unknown,
    svgTargetId?: unknown
  ) {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const mode = operatingRegime(regime);
    if (
      svgTargetId !== undefined &&
      (mode !== "act" || !NativeEditorSvgText.isId(svgTargetId))
    )
      throw new Error("native_chat_svg_text_target_invalid");
    const selected = agentEffort(effort);
    const surfaces =
      mode === "act"
        ? attachment.editorSurfaces?.selection(svgTargetId)
        : undefined;
    const result = await owner.active.chat.submit(
      attachment.session,
      inputId,
      text,
      mode,
      ...submitSelections(surfaces, selected)
    );
    this.revalidate(owner, attachment);
    return result;
  }

  async enqueue(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    inputId: string,
    text: string,
    regime?: unknown,
    effort?: unknown
  ) {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const selected = agentEffort(effort);
    const result = await owner.active.chat.enqueue(
      attachment.session,
      inputId,
      text,
      operatingRegime(regime),
      ...(selected ? [selected] : [])
    );
    this.revalidate(owner, attachment);
    return result;
  }

  acceptsLibrarySelection(event: IpcMainInvokeEvent): boolean {
    const { chat } = this.owner(event).active;
    return chat.acceptsLibrarySelection === true;
  }

  async submitWithLibrarySelection(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    inputId: string,
    text: string,
    regime?: unknown,
    effort?: unknown
  ): Promise<NativeChatAcceptance> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const { chat } = owner.active;
    if (!chat.acceptsLibrarySelection || !chat.submitWithLibrarySelection)
      throw new Error("native_chat_library_selection_unavailable");
    const mode = operatingRegime(regime);
    const surfaces =
      mode === "act" ? attachment.editorSurfaces?.selection() : undefined;
    const result = await chat.submitWithLibrarySelection(
      attachment.session,
      inputId,
      text,
      mode,
      ...submitSelections(surfaces, agentEffort(effort))
    );
    this.revalidate(owner, attachment);
    return result;
  }

  acceptsWakeups(event: IpcMainInvokeEvent): boolean {
    return this.owner(event).active.chat.acceptsWakeups === true;
  }

  acceptsEffort(event: IpcMainInvokeEvent): boolean {
    return this.owner(event).active.chat.acceptsEffort === true;
  }

  acceptsGoalEffort(event: IpcMainInvokeEvent): boolean {
    return this.owner(event).active.chat.acceptsGoalEffort === true;
  }

  async submitWithWakeup(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    inputId: string,
    text: string,
    effort?: unknown
  ): Promise<NativeChatAcceptance> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const chat = owner.active.chat;
    if (!chat.acceptsWakeups || !chat.submitWithWakeup)
      throw new Error("native_chat_wakeup_unavailable");
    const selected = agentEffort(effort);
    const surfaces = attachment.editorSurfaces?.selection();
    const result = await chat.submitWithWakeup(
      attachment.session,
      inputId,
      text,
      ...submitSelections(surfaces, selected)
    );
    this.revalidate(owner, attachment);
    return result;
  }

  async scheduledWakeup(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    observationId: string
  ): Promise<NativeChatWakeup | null> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const snapshot = requireObservation(attachment, observationId);
    const chat = owner.active.chat;
    if (!chat.acceptsWakeups || !chat.scheduledWakeup) return null;
    const selected = NativeAgentWakeups.turn(snapshot);
    if (!selected) return null;
    const requireCurrent = () => {
      const latest = attachment.latestObservation;
      if (
        !latest ||
        NativeAgentWakeups.turn(latest)?.turnId !== selected.turnId
      )
        throw new Error("native_chat_wakeup_changed");
    };
    requireCurrent();
    const result = await chat.scheduledWakeup(attachment.session, snapshot);
    this.revalidate(owner, attachment);
    requireCurrent();
    return result;
  }

  async controlWakeup(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    observationId: string,
    waitId: unknown,
    action: unknown
  ): Promise<NativeChatWakeup> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const snapshot = requireObservation(attachment, observationId);
    const chat = owner.active.chat;
    const turn = snapshot.current;
    const requireCurrent = () => {
      const latest = attachment.latestObservation?.current;
      if (!turn || latest?.turnId !== turn.turnId || latest.cancelled)
        throw new Error("native_chat_wakeup_changed");
    };
    if (
      !chat.acceptsWakeups ||
      !chat.scheduledWakeup ||
      !chat.controlWakeup ||
      typeof waitId !== "string" ||
      (action !== "cancel" && action !== "recover")
    )
      throw new Error("native_chat_wakeup_unavailable");
    requireCurrent();
    const schedule = await chat.scheduledWakeup(attachment.session, snapshot);
    this.revalidate(owner, attachment);
    requireCurrent();
    if (schedule?.waitId !== waitId)
      throw new Error("native_chat_wakeup_changed");
    const updated = await chat.controlWakeup(
      attachment.session,
      snapshot,
      waitId,
      action
    );
    this.revalidate(owner, attachment);
    return updated;
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

  acceptsPng(event: IpcMainInvokeEvent): boolean {
    return this.owner(event).active.chat.acceptsPng;
  }

  acceptsFile(event: IpcMainInvokeEvent): boolean {
    return this.owner(event).active.chat.acceptsFile;
  }

  async contextLimit(event: IpcMainInvokeEvent): Promise<NativeContextLimit> {
    const owner = this.owner(event);
    const basis = await owner.active.chat.inspectContextLimit();
    this.revalidate(owner);
    const reviewId = randomUUID();
    owner.contextLimit = { id: reviewId, basis };
    return {
      reviewId,
      limit: basis.limit,
      exactCounting: basis.exactCounting,
      source: basis.source,
    };
  }

  async inspectHooks(
    event: IpcMainInvokeEvent,
    attachmentId?: string
  ): Promise<NativeHookInspection> {
    const owner = this.owner(event);
    const session =
      attachmentId === undefined
        ? undefined
        : this.requireAttachment(event, attachmentId).attachment.session;
    if (!owner.active.chat.inspectHooks)
      throw new Error("native_hooks_unavailable");
    const result = await owner.active.chat.inspectHooks(session?.id);
    this.revalidate(owner);
    return result;
  }

  async importHook(
    event: IpcMainInvokeEvent
  ): Promise<NativeHookInspection | null> {
    const owner = this.owner(event);
    const chat = owner.active.chat;
    if (
      !this.hookReview ||
      !chat.reviewHook ||
      !chat.installHook ||
      !chat.inspectHooks
    )
      throw new Error("native_hooks_unavailable");
    if (owner.reviewingHooks) throw new Error("native_hook_review_busy");
    owner.reviewingHooks = true;
    try {
      const file = await this.hookReview.choose(owner.sender);
      this.revalidate(owner);
      if (file === null) return null;
      const review = await chat.reviewHook(file);
      this.revalidate(owner);
      const accepted = await this.hookReview.confirm(
        owner.sender,
        review.definition,
        review.workspace,
        "install"
      );
      this.revalidate(owner);
      if (!accepted) return null;
      await chat.installHook(review);
      this.revalidate(owner);
      return await this.inspectHooks(event);
    } finally {
      owner.reviewingHooks = false;
    }
  }

  async removeHook(
    event: IpcMainInvokeEvent,
    id: unknown,
    revision: unknown
  ): Promise<NativeHookInspection> {
    const owner = this.owner(event);
    const chat = owner.active.chat;
    if (
      !this.hookReview ||
      !chat.inspectHooks ||
      !chat.removeHook ||
      typeof id !== "string" ||
      typeof revision !== "string"
    )
      throw new Error("native_hooks_unavailable");
    if (owner.reviewingHooks) throw new Error("native_hook_review_busy");
    owner.reviewingHooks = true;
    try {
      const inspection = await chat.inspectHooks();
      this.revalidate(owner);
      const definition = inspection.saved.find(
        (hook) => hook.id === id && hook.revision === revision
      );
      if (!definition) throw new Error("native_hook_revision_changed");
      const accepted = await this.hookReview.confirm(
        owner.sender,
        definition,
        "Current workspace",
        "remove"
      );
      this.revalidate(owner);
      if (!accepted) return inspection;
      await chat.removeHook(id, revision);
      this.revalidate(owner);
      return await this.inspectHooks(event);
    } finally {
      owner.reviewingHooks = false;
    }
  }

  async saveContextLimit(
    event: IpcMainInvokeEvent,
    reviewId: unknown,
    value: unknown
  ): Promise<NativeContextLimitResult> {
    const owner = this.owner(event);
    const inspected = owner.contextLimit;
    const limit = contextLimitValue(value);
    if (!inspected || inspected.id !== reviewId)
      throw new Error("native_context_limit_review_unavailable");
    if (inspected.write) {
      if (inspected.write.limit !== limit)
        throw new Error("native_context_limit_review_reused");
      return inspected.write.result;
    }
    if (
      inspected.basis.source === "invalid" ||
      (limit !== null && !inspected.basis.exactCounting)
    )
      throw new Error("native_context_limit_unavailable");
    const result = (async (): Promise<NativeContextLimitResult> => {
      await this.reviewConfiguration(owner, { kind: "limit", limit });
      this.revalidate(owner);
      if (owner.contextLimit !== inspected)
        throw new Error("native_context_limit_review_unavailable");
      try {
        await owner.active.chat.updateContextLimit(inspected.basis, limit);
        this.revalidate(owner);
        return { limit, disposition: "applied" };
      } catch (error) {
        this.revalidate(owner);
        if (
          !(error instanceof Error) ||
          error.message !== "native_agent_request_timeout"
        )
          throw error;
        const current = await owner.active.chat.inspectContextLimit();
        this.revalidate(owner);
        if (current.source === "active" && current.limit === limit)
          return { limit, disposition: "observed" };
        throw error;
      }
    })();
    inspected.write = { limit, result };
    void result.catch(() => {
      inspected.write = undefined;
    });
    return result;
  }

  async submitWithConfigurationReview(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    value: unknown
  ): Promise<NativeChatAcceptance> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const input = configurationInput(value);
    if (input.effort !== undefined && !owner.active.chat.acceptsEffort)
      throw new Error("native_chat_effort_unavailable");
    let review = attachment.reviewedConfiguration;
    if (review?.input.inputId === input.inputId) {
      if (
        review.input.text !== input.text ||
        review.input.action !== input.action ||
        review.input.effort !== input.effort
      )
        throw new Error("native_context_limit_review_reused");
      if (review.accepted) return review.accepted;
      if (review.request) return review.request;
    } else {
      if (review?.request) throw new Error("native_context_limit_review_busy");
      review = { input, approved: false };
      attachment.reviewedConfiguration = review;
    }
    const exact = review;
    exact.request = (async () => {
      if (!exact.approved) {
        const inspected = await owner.active.chat.inspectContextLimit();
        this.revalidate(owner, attachment);
        if (!inspected.exactCounting || inspected.source === "invalid")
          throw new Error("native_context_limit_unavailable");
        await this.reviewConfiguration(owner, {
          kind: "message",
          text: input.text,
        });
        this.revalidate(owner, attachment);
        exact.approved = true;
      }
      const accepted = await owner.active.chat.sendConfiguration(
        attachment.session,
        exact.input
      );
      this.revalidate(owner, attachment);
      exact.accepted = accepted;
      return accepted;
    })().finally(() => {
      exact.request = undefined;
    });
    return exact.request;
  }

  private async reviewConfiguration(
    owner: Owner,
    review: ConfigurationReview
  ): Promise<void> {
    if (!this.confirmConfiguration || owner.reviewingConfiguration)
      throw new Error("native_context_limit_review_busy");
    owner.reviewingConfiguration = true;
    try {
      if (!(await this.confirmConfiguration(owner.sender, review)))
        throw new Error("native_context_limit_review_declined");
    } finally {
      owner.reviewingConfiguration = false;
    }
  }

  async submitImage(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    input: unknown
  ) {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const result = await owner.active.chat.submitImage(
      attachment.session,
      input
    );
    this.revalidate(owner, attachment);
    return result;
  }

  async submitFile(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    input: unknown
  ) {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const result = await owner.active.chat.submitFile(
      attachment.session,
      input
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
    if (
      !attachment.latestObservation ||
      snapshot.sessionRevision >= attachment.latestObservation.sessionRevision
    )
      attachment.latestObservation = snapshot;
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

  async turnSummary(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    observationId: string,
    refreshGatewayAttempt?: unknown,
    childBillingAfter?: unknown
  ): Promise<NativeChatTurnSummary> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const snapshot = requireObservation(attachment, observationId);
    const latest = snapshot.latest;
    if (
      latest?.disposition !== "settled" ||
      latest.status === null ||
      attachment.latestObservation?.latest?.turnId !== latest.turnId
    )
      throw new Error("native_chat_turn_summary_unavailable");
    const requireCurrent = () => {
      this.revalidate(owner, attachment);
      if (attachment.latestObservation?.latest?.turnId !== latest.turnId)
        throw new Error("native_chat_turn_summary_unavailable");
    };
    const summary =
      refreshGatewayAttempt === undefined && childBillingAfter === undefined
        ? await owner.active.chat.turnSummary(attachment.session, snapshot)
        : await owner.active.chat.turnSummary(attachment.session, snapshot, {
            attempt: refreshGatewayAttempt,
            childBillingAfter,
            requireCurrent,
          });
    requireCurrent();
    attachment.artifacts = summary.artifacts?.length
      ? { turnId: latest.turnId, items: summary.artifacts }
      : undefined;
    return summary;
  }

  async readArtifact(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    observationId: string,
    artifactId: unknown
  ): Promise<ArrayBuffer> {
    return this.captureArtifact(
      event,
      attachmentId,
      observationId,
      artifactId
    ).read();
  }

  async saveArtifact(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    observationId: string,
    artifactId: unknown
  ): Promise<NativeChatArtifactSaveResult> {
    const select = this.selectArtifactDestination;
    if (!select) throw new Error("native_chat_artifact_unavailable");
    const { owner, requireCurrent, read } = this.captureArtifact(
      event,
      attachmentId,
      observationId,
      artifactId
    );
    const { sender } = owner;
    if (this.savingArtifact.has(sender))
      throw new Error("native_chat_artifact_busy");
    this.savingArtifact.add(sender);
    try {
      const destination = await select(sender).catch(() => undefined);
      requireCurrent();
      if (destination === undefined) return "failed";
      if (destination === null) return "cancelled";
      const bytes = await read();
      try {
        await RetainedFileExport.publish(
          destination,
          ".png",
          new Uint8Array(bytes),
          requireCurrent
        );
        return "saved";
      } catch {
        requireCurrent();
        return "failed";
      }
    } finally {
      this.savingArtifact.delete(sender);
    }
  }

  private captureArtifact(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    observationId: string,
    artifactId: unknown
  ) {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const snapshot = requireObservation(attachment, observationId);
    const turnId = snapshot.latest?.turnId;
    const projection = attachment.artifacts;
    const chat = owner.active.chat;
    const read = chat.readArtifact;
    const artifact = projection?.items.find((item) => item.id === artifactId);
    if (
      !read ||
      !artifact ||
      !turnId ||
      snapshot.current ||
      projection?.turnId !== turnId
    )
      throw new Error("native_chat_artifact_unavailable");
    const requireCurrent = () => {
      this.revalidate(owner, attachment);
      if (
        attachment.latestObservation?.current ||
        attachment.latestObservation?.latest?.turnId !== turnId
      )
        throw new Error("native_chat_artifact_unavailable");
    };
    requireCurrent();
    return {
      owner,
      requireCurrent,
      read: async () => {
        if (attachment.readingArtifact)
          throw new Error("native_chat_artifact_busy");
        attachment.readingArtifact = true;
        try {
          const bytes = await read.call(
            chat,
            attachment.session,
            snapshot,
            artifact
          );
          requireCurrent();
          return bytes;
        } finally {
          attachment.readingArtifact = false;
        }
      },
    };
  }

  async transcript(event: IpcMainInvokeEvent, attachmentId: string) {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const messages = await owner.active.chat.transcript(attachment.session);
    this.revalidate(owner, attachment);
    return messages;
  }

  async transcriptPage(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    before?: unknown
  ) {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const page = await owner.active.chat.transcriptPage(
      attachment.session,
      before
    );
    this.revalidate(owner, attachment);
    return page;
  }

  async queue(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    observationId: string,
    offset: number
  ): Promise<NativeChatQueuePage> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const snapshot = requireObservation(attachment, observationId);
    const page = await owner.active.chat.queue(
      attachment.session,
      snapshot,
      offset
    );
    this.revalidate(owner, attachment);
    return page;
  }

  async queuedText(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    observationId: string,
    inputId: string
  ): Promise<string> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const snapshot = requireObservation(attachment, observationId);
    const text = await owner.active.chat.queuedText(
      attachment.session,
      snapshot,
      inputId
    );
    this.revalidate(owner, attachment);
    return text;
  }

  async editQueue(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    input: unknown
  ): Promise<NativeChatQueueReceipt> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const change = queueChange(input);
    const snapshot = requireObservation(attachment, change.observationId);
    const receipt = await owner.active.chat.editQueue(
      attachment.session,
      snapshot,
      change,
      () => this.revalidate(owner, attachment)
    );
    this.revalidate(owner, attachment);
    return receipt;
  }

  async steer(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    input: unknown
  ): Promise<NativeChatControlReceipt> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const value = record(input);
    if (
      !value ||
      Object.keys(value).length !== 3 ||
      !token(value.observationId) ||
      typeof value.requestId !== "string" ||
      typeof value.text !== "string"
    )
      throw new Error("native_chat_steering_invalid");
    const snapshot = requireObservation(attachment, value.observationId);
    const receipt = await owner.active.chat.steer(
      attachment.session,
      snapshot,
      {
        observationId: value.observationId,
        requestId: value.requestId,
        text: value.text,
      }
    );
    this.revalidate(owner, attachment);
    return receipt;
  }

  async goal(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    observationId: string
  ): Promise<NativeChatGoalObservation> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const snapshot = requireObservation(attachment, observationId);
    const inspection = await owner.active.chat.goal(
      attachment.session,
      snapshot
    );
    this.revalidate(owner, attachment);
    const token =
      inspection.goal &&
      retainReview(
        attachment.goals,
        inspection,
        (left, right) =>
          left.sessionId === right.sessionId &&
          left.sessionRevision === right.sessionRevision &&
          left.stateRevision === right.stateRevision &&
          left.basis?.goal === right.basis?.goal &&
          left.basis?.revision === right.basis?.revision
      );
    return {
      observationId: token,
      goal: inspection.goal,
      ...(inspection.basis && { goalRevision: inspection.basis.revision }),
    };
  }

  async startGoal(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    inputId: string,
    request: unknown
  ) {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const accepted = await owner.active.chat.startGoal(
      attachment.session,
      inputId,
      request
    );
    this.revalidate(owner, attachment);
    return accepted;
  }

  async controlGoal(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    input: unknown
  ): Promise<NativeChatGoalReceipt> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const change = record(input);
    if (
      !change ||
      Object.keys(change).length !== (change.action === "revise" ? 4 : 3) ||
      !token(change.observationId) ||
      typeof change.requestId !== "string" ||
      (change.action !== "pause" &&
        change.action !== "resume" &&
        change.action !== "confirm_completion" &&
        change.action !== "reconcile_review" &&
        change.action !== "revise" &&
        change.action !== "clear")
    )
      throw new Error("native_chat_goal_control_invalid");
    const inspection = attachment.goals.get(change.observationId);
    if (!inspection)
      throw new Error("native_chat_goal_observation_unavailable");
    const reference = {
      observationId: change.observationId,
      requestId: change.requestId,
    };
    const receipt = await owner.active.chat.controlGoal(
      attachment.session,
      inspection,
      change.action === "revise"
        ? {
            ...reference,
            action: change.action,
            objective: NativeAgentGoals.readObjective(change.objective),
          }
        : { ...reference, action: change.action }
    );
    this.revalidate(owner, attachment);
    return receipt;
  }

  async approvals(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    observationId: string
  ): Promise<readonly NativeChatApproval[]> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const snapshot = requireObservation(attachment, observationId);
    const reviews = await owner.active.chat.approvals(
      attachment.session,
      snapshot
    );
    this.revalidate(owner, attachment);
    return reviews.slice(0, MAX_REVIEWS).map((review) => {
      const reviewId = retainReview(attachment.approvals, review, sameApproval);
      const { tool, root, relativePath, query } = review;
      return {
        reviewId,
        tool,
        root,
        relativePath,
        ...(query === undefined ? {} : { query }),
      };
    });
  }

  async questions(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    observationId: string
  ): Promise<readonly NativeChatQuestion[]> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const snapshot = requireObservation(attachment, observationId);
    const reviews = await owner.active.chat.questions(
      attachment.session,
      snapshot
    );
    this.revalidate(owner, attachment);
    return reviews.slice(0, MAX_REVIEWS).map((review) => ({
      questionId: JSON.stringify([review.task.turnId, review.waitId]),
      reviewId: retainReview(attachment.questions, review, sameQuestion),
      style: review.style,
      question: review.question,
      options: review.options,
    }));
  }

  async answerQuestion(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    reviewId: string,
    input: unknown
  ): Promise<NativeChatControlReceipt> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const review = token(reviewId)
      ? attachment.questions.get(reviewId)
      : undefined;
    if (!review) throw new Error("native_chat_question_unavailable");
    const answer = questionAnswer(input, review.options.length);
    const receipt = await owner.active.chat.answerQuestion(
      attachment.session,
      review,
      answer
    );
    this.revalidate(owner, attachment);
    return receipt;
  }

  async librarySelections(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    observationId: string
  ): Promise<readonly NativeChatLibrarySelection[]> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const { chat } = owner.active;
    if (!chat.acceptsLibrarySelection || !chat.librarySelections) return [];
    const snapshot = requireObservation(attachment, observationId);
    const reviews = await chat.librarySelections(attachment.session, snapshot);
    this.revalidate(owner, attachment);
    return reviews.slice(0, MAX_REVIEWS).map((review) => ({
      selectionId: JSON.stringify([review.task.turnId, review.waitId]),
      reviewId: retainReview(
        attachment.librarySelections,
        review,
        (left, right) =>
          left.task.requestId === right.task.requestId &&
          left.initialSearchQuery === right.initialSearchQuery
      ),
      initialSearchQuery: review.initialSearchQuery,
    }));
  }

  async answerLibrarySelection(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    reviewId: string,
    answer: unknown
  ): Promise<NativeChatControlReceipt> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const { chat } = owner.active;
    const review = token(reviewId)
      ? attachment.librarySelections.get(reviewId)
      : undefined;
    if (
      !review ||
      !chat.acceptsLibrarySelection ||
      !chat.answerLibrarySelection
    )
      throw new Error("native_chat_library_selection_unavailable");
    const receipt = await chat.answerLibrarySelection(
      attachment.session,
      review,
      answer
    );
    this.revalidate(owner, attachment);
    return receipt;
  }

  async answerApproval(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    reviewId: string,
    decision: unknown
  ): Promise<NativeChatControlReceipt> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    if (decision !== "approve_once" && decision !== "decline")
      throw new Error("native_chat_approval_decision_invalid");
    const review = token(reviewId)
      ? attachment.approvals.get(reviewId)
      : undefined;
    if (!review) throw new Error("native_chat_approval_unavailable");
    const receipt = await owner.active.chat.answerApproval(
      attachment.session,
      review,
      decision
    );
    this.revalidate(owner, attachment);
    return receipt;
  }

  async control(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    input: unknown
  ): Promise<NativeChatControlResult> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const control = record(input);
    const action = control?.action;
    const cancelledWakeupId = control?.cancelledWakeupId;
    if (
      (action !== "pause" && action !== "stop" && action !== "resume") ||
      !token(control?.observationId) ||
      typeof control?.requestId !== "string" ||
      (cancelledWakeupId !== undefined &&
        (action !== "resume" || typeof cancelledWakeupId !== "string"))
    )
      throw new Error("native_chat_control_invalid");
    const snapshot = attachment.observations.get(control.observationId);
    if (!snapshot) throw new Error("native_chat_observation_unavailable");
    const { chat } = owner.active;
    if (cancelledWakeupId !== undefined) {
      const turn = snapshot.current;
      if (
        !chat.acceptsWakeups ||
        !chat.scheduledWakeup ||
        !turn ||
        turn.paused ||
        turn.cancelled ||
        turn.disposition !== "suspended"
      )
        throw new Error("native_chat_wakeup_unavailable");
      const schedule = await chat.scheduledWakeup(attachment.session, snapshot);
      this.revalidate(owner, attachment);
      if (
        schedule?.waitId !== cancelledWakeupId ||
        schedule.status !== "cancelled" ||
        schedule.turnId !== turn.turnId
      )
        throw new Error("native_chat_wakeup_changed");
    }
    const result =
      action === "resume"
        ? ({
            action,
            turn: await chat.resume(
              attachment.session,
              snapshot,
              control.requestId,
              cancelledWakeupId
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
    const file =
      this.documentFrame(owner.sender, owner.frame) ??
      this.nestedDeckFrame(owner.sender, owner.frame);
    let delivery = Promise.resolve();
    let delivered = 0;
    let chunks = 0;
    let accepting = true;
    try {
      const stop = owner.active.chat.subscribe(attachment.session, (update) => {
        if (
          !accepting ||
          owner.subscriptions.get(subscriptionId) !== subscription
        )
          return;
        const bytes =
          update.kind === "text" ? Buffer.byteLength(update.text) : 0;
        if (bytes > MAX_UPDATE_BYTES) return;
        delivered += bytes;
        const limited =
          ++chunks > MAX_DELIVERY_CHUNKS || delivered > MAX_DELIVERY_BYTES;
        if (limited) accepting = false;
        const send = () => {
          if (owner.subscriptions.get(subscriptionId) !== subscription) return;
          this.revalidate(owner, attachment);
          if (limited) this.unsubscribeOwned(owner, subscriptionId);
          const payload: NativeChatUpdate = limited
            ? { kind: "closed", reason: "delivery_limit" }
            : update;
          owner.frame.send(IPC_CHANNELS.NATIVE_CHAT_UPDATE, {
            subscriptionId,
            attachmentId,
            update: payload,
          });
        };
        if (file) {
          delivery = delivery
            .then(async () => {
              if (owner.subscriptions.get(subscriptionId) !== subscription)
                return;
              await file.recheck();
              send();
            })
            .catch((error: unknown) => {
              if (limited || !fileScopeBusy(error))
                this.unsubscribeOwned(owner, subscriptionId);
            });
          return;
        }
        try {
          send();
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
      if (
        owner.active.chat.ownsSession &&
        !owner.active.chat.ownsSession(session)
      )
        throw new Error("native_chat_session_deleted");
      const existing = [...owner.attachments.values()].find(
        (entry) => entry.session === session
      );
      const attachment = existing ?? {
        id: randomUUID(),
        session,
        observations: new Map(),
        approvals: new Map(),
        questions: new Map(),
        librarySelections: new Map(),
        goals: new Map(),
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
      existing.href === frame.url &&
      sameActive(existing.active, active)
    )
      return existing;
    existing?.release();
    const owner: Owner = {
      sender,
      frame,
      href: frame.url,
      active,
      attachments: new Map(),
      retired: new Set(),
      subscriptions: new Map(),
      pending: 0,
      listing: false,
      release: () => {
        if (this.owners.get(sender) !== owner) return;
        this.owners.delete(sender);
        stopWatching();
        for (const id of owner.subscriptions.keys())
          this.unsubscribeOwned(owner, id);
        for (const attachment of owner.attachments.values()) {
          attachment.editorSurfaces?.close();
          void this.releaseSide(owner, attachment).catch(() => {});
        }
        owner.attachments.clear();
      },
    };
    this.owners.set(sender, owner);
    const stopWatching = ipc_sender.watchNavigation(sender, owner.release);
    return owner;
  }

  private requireAttachment(
    event: IpcMainInvokeEvent,
    id: string
  ): { owner: Owner; attachment: Attachment } {
    const owner = this.owners.get(event.sender);
    const attachment = token(id) ? owner?.attachments.get(id) : undefined;
    if (owner && owner.frame === event.senderFrame && owner.retired.has(id)) {
      this.revalidate(owner);
      throw new Error("native_chat_session_deleted");
    }
    if (!owner || owner.frame !== event.senderFrame || !attachment)
      throw new Error("native_chat_attachment_unavailable");
    this.revalidate(owner, attachment);
    return { owner, attachment };
  }

  private revalidateRevision(
    owner: Owner,
    attachment: Attachment,
    expected?: number
  ): void {
    this.revalidate(owner, attachment);
    if (expected === undefined) return;
    const latest = attachment.latestObservation;
    if (latest?.sessionRevision !== expected)
      throw new Error("stale_session_revision");
    if (latest.current || latest.queuedInputs)
      throw new Error("history_revision_requires_idle");
  }

  private revalidate(owner: Owner, attachment?: Attachment): void {
    if (this.owners.get(owner.sender) !== owner)
      throw new Error("native_chat_attachment_unavailable");
    if (attachment && owner.attachments.get(attachment.id) !== attachment)
      throw new Error(
        owner.retired.has(attachment.id)
          ? "native_chat_session_deleted"
          : "native_chat_attachment_unavailable"
      );
    if (
      owner.href !== owner.frame.url ||
      !sameActive(owner.active, this.scope(owner.sender, owner.frame))
    ) {
      owner.release();
      throw new Error("native_chat_scope_changed");
    }
  }

  private unsubscribeOwned(owner: Owner, id: string): void {
    const subscription = owner.subscriptions.get(id);
    owner.subscriptions.delete(id);
    subscription?.stop();
  }

  private deletableEntry(
    owner: Owner,
    entry: NativeChatCatalogEntry
  ): NativeChatCatalogEntry {
    return this.confirmDeletion &&
      owner.active.chat.acceptsSavedChatDeletion &&
      owner.active.chat.deleteSavedChat
      ? { ...entry, deletionAvailable: true }
      : entry;
  }

  private retireAttachments(
    active: ActiveNativeChat,
    session: NativeChatSession
  ): void {
    for (const owner of this.owners.values()) {
      if (!sameActive(active, owner.active)) continue;
      for (const attachment of owner.attachments.values()) {
        if (attachment.session !== session) continue;
        owner.attachments.delete(attachment.id);
        attachment.editorSurfaces?.close();
        owner.retired.add(attachment.id);
        if (owner.retired.size > MAX_ATTACHMENTS) {
          const oldest = owner.retired.values().next().value;
          if (oldest) owner.retired.delete(oldest);
        }
        for (const [subscriptionId, subscription] of owner.subscriptions) {
          if (subscription.attachment !== attachment) continue;
          this.unsubscribeOwned(owner, subscriptionId);
          try {
            this.revalidate(owner);
            owner.frame.send(IPC_CHANNELS.NATIVE_CHAT_UPDATE, {
              subscriptionId,
              attachmentId: attachment.id,
              update: { kind: "closed", reason: "session_deleted" },
            });
          } catch {
            // The frame can navigate after the host commits its deletion.
          }
        }
      }
    }
  }

  private releaseSide(owner: Owner, attachment: Attachment): Promise<void> {
    if (attachment.closingSide) return attachment.closingSide;
    const side = attachment.side;
    if (!side) return Promise.resolve();
    attachment.side = undefined;
    const chat = owner.active.chat;
    const closing = (async () => {
      let opened = side.chat ?? (await side.opening?.catch(() => undefined));
      if (!opened && side.unconfirmed)
        opened = await chat.openSideChat(
          attachment.session,
          side.nativeRequestId
        );
      if (opened) await chat.closeSideChat(opened);
    })().finally(() => {
      if (attachment.closingSide === closing)
        attachment.closingSide = undefined;
    });
    attachment.closingSide = closing;
    return closing;
  }

  private scope(
    sender: WebContents,
    frame: WebFrameMain | null
  ): ActiveNativeChat | null {
    const id = this.workspaceId(sender, frame);
    if (!id) return null;
    if (this.documentFrame(sender, frame)?.key === id) {
      const active = this.documents?.current(id);
      return active?.workspaceId === id ? active : null;
    }
    const nested = this.nestedDeckFrame(sender, frame)?.grant;
    if (nested) {
      const active = this.nestedDecks?.current(nested.parentWorkspaceId, id);
      return active?.workspaceId === id &&
        active.directoryIdentity &&
        sameDirectory(nested.identity, active.directoryIdentity)
        ? active
        : null;
    }
    const active = this.resolve(
      sender,
      id,
      this.profile(sender, frame, id)?.id
    );
    if (active?.workspaceId !== id) return null;
    if (ipc_sender.pathname(frame?.url) === "/desktop/file") {
      const deck = this.deckFrames.get(sender);
      if (
        !deck?.identity ||
        !active.directoryIdentity ||
        !sameDirectory(deck.identity, active.directoryIdentity)
      )
        return null;
    }
    return active;
  }

  private profile(
    sender: WebContents,
    frame: WebFrameMain | null,
    workspaceId: string
  ) {
    const profile = this.selectedProfiles.get(sender);
    return profile?.frame === frame &&
      profile.href === frame?.url &&
      profile.workspaceId === workspaceId
      ? profile
      : undefined;
  }

  private documentFrame(sender: WebContents, frame: WebFrameMain | null) {
    const document = this.documentFrames.get(sender);
    return document?.frame === frame && document.href === frame?.url
      ? document
      : undefined;
  }

  private nestedDeckFrame(sender: WebContents, frame: WebFrameMain | null) {
    const nested = this.nestedDeckFrames.get(sender);
    return nested?.frame === frame && nested.href === frame?.url
      ? nested
      : undefined;
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
    if (url.pathname === "/desktop/file") {
      const docId = ipc_sender.documentId(raw);
      if (docId) {
        if (this.disabled) return docId;
        return this.documentFrame(sender, frame)?.key ?? null;
      }
      const nested = ipc_sender.nestedDeck(raw);
      if (nested)
        return this.startup
          ? (this.nestedDeckFrame(sender, frame)?.grant?.workspaceId ?? null)
          : nested.workspaceId;
      const id = ipc_sender.rootDeckId(raw);
      const deck = this.deckFrames.get(sender);
      return id &&
        (!this.startup ||
          (deck?.frame === frame &&
            deck.href === raw &&
            deck.workspaceId === id &&
            deck.identity))
        ? id
        : null;
    }
    if (url.pathname !== "/desktop/workspace") return null;
    const [id, duplicate] = url.searchParams.getAll("id");
    return id && id.length <= 1024 && duplicate === undefined ? id : null;
  }
}

function fileScopeBusy(error: unknown): boolean {
  return (
    error instanceof NativeDocumentIdentityBusy ||
    (error instanceof Error && error.message === "workspace_catalog_busy")
  );
}

function sameDirectory(
  first: WorkspaceDirectoryIdentity,
  second: WorkspaceDirectoryIdentity
): boolean {
  return (
    first.device === second.device &&
    first.inode === second.inode &&
    first.birthTimeNs === second.birthTimeNs
  );
}

function chatProfileSelection(value: unknown): NativeChatProfileSelection {
  if (value && typeof value === "object") {
    const selection = value as { kind?: unknown; id?: unknown };
    const keys = Object.keys(value).length;
    if (keys === 1 && selection.kind === "default") return { kind: "default" };
    if (
      keys === 2 &&
      (selection.kind === "new" || selection.kind === "saved") &&
      NativeChatProfiles.validId(selection.id)
    )
      return { kind: selection.kind, id: selection.id };
  }
  throw new Error("native_chat_profile_selection_invalid");
}

function sameActive(
  left: ActiveNativeChat,
  right: ActiveNativeChat | null
): boolean {
  return left.chat === right?.chat && left.workspaceId === right.workspaceId;
}

function retainReview<T>(
  reviews: Map<string, T>,
  review: T,
  same: (left: T, right: T) => boolean
): string {
  const existing = [...reviews].find(([, value]) => same(value, review));
  const id = existing?.[0] ?? randomUUID();
  reviews.delete(id);
  const oldest = reviews.keys().next().value;
  if (oldest && reviews.size >= MAX_REVIEWS) reviews.delete(oldest);
  reviews.set(id, review);
  return id;
}

function sameApproval(
  left: NativeApprovalReview,
  right: NativeApprovalReview
): boolean {
  return (
    left.sessionId === right.sessionId &&
    left.turnId === right.turnId &&
    left.waitId === right.waitId &&
    left.sessionRevision === right.sessionRevision &&
    left.controlRevision === right.controlRevision &&
    left.directory === right.directory &&
    left.root === right.root &&
    left.tool === right.tool &&
    left.relativePath === right.relativePath &&
    left.query === right.query
  );
}

function sameQuestion(
  left: NativeQuestionReview,
  right: NativeQuestionReview
): boolean {
  return (
    left.task.requestId === right.task.requestId &&
    left.style === right.style &&
    left.question === right.question &&
    left.options.length === right.options.length &&
    left.options.every((option, index) => option === right.options[index])
  );
}

function questionAnswer(
  input: unknown,
  options: number
): NativeChatQuestionAnswer {
  const answer = record(input);
  if (answer) {
    const fields = Object.keys(answer).length;
    if (answer.kind === "skipped" && fields === 1) return { kind: "skipped" };
    if (
      fields === 2 &&
      answer.kind === "choice" &&
      typeof answer.index === "number" &&
      Number.isSafeInteger(answer.index) &&
      answer.index >= 0 &&
      answer.index < options
    )
      return { kind: "choice", index: answer.index };
    if (
      fields === 2 &&
      answer.kind === "text" &&
      typeof answer.text === "string" &&
      answer.text.trim() &&
      Buffer.byteLength(answer.text) <= 4096
    )
      return { kind: "text", text: answer.text };
  }
  throw new Error("native_chat_question_answer_invalid");
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
    left.current?.controlRevision === right.current?.controlRevision &&
    left.latest?.turnId === right.latest?.turnId &&
    left.latest?.disposition === right.latest?.disposition &&
    left.latest?.status === right.latest?.status
  );
}

function token(value: unknown): value is string {
  return typeof value === "string" && TOKEN.test(value);
}

function operatingRegime(
  value: unknown
): NativeChatOperatingRegime | undefined {
  if (value === undefined || value === "act" || value === "plan") return value;
  throw new Error("native_chat_operating_regime_invalid");
}

const EFFORTS: ReadonlySet<unknown> = new Set([
  "low",
  "medium",
  "high",
  "xhigh",
  "ultra",
  "standard",
]);

function agentEffort(value: unknown): NativeChatEffort | undefined {
  if (value === undefined || EFFORTS.has(value))
    return value as NativeChatEffort | undefined;
  throw new Error("native_chat_effort_invalid");
}

function submitSelections(
  surfaces: NativeEditorSurfaceSelection | undefined,
  effort: NativeChatEffort | undefined
): [surfaces?: NativeEditorSurfaceSelection, effort?: NativeChatEffort] {
  if (effort) return [surfaces, effort];
  return surfaces ? [surfaces] : [];
}

function configurationInput(value: unknown): NativeChatConfigurationInput {
  const input = record(value);
  if (
    !input ||
    Object.keys(input).length !== (input.effort === undefined ? 3 : 4) ||
    (input.action !== "submit" && input.action !== "enqueue") ||
    !token(input.inputId) ||
    typeof input.text !== "string" ||
    !input.text.trim() ||
    Buffer.byteLength(input.text) > MAX_CONFIGURATION_MESSAGE_BYTES
  )
    throw new Error("native_context_limit_review_invalid");
  const effort = agentEffort(input.effort);
  return {
    action: input.action,
    inputId: input.inputId,
    text: input.text,
    ...(effort && { effort }),
  };
}

function requireObservation(
  attachment: Attachment,
  id: unknown
): NativeChatSnapshot {
  const snapshot = token(id) ? attachment.observations.get(id) : undefined;
  if (!snapshot) throw new Error("native_chat_observation_unavailable");
  return snapshot;
}

function queueChange(input: unknown): NativeChatQueueChange {
  const change = record(input);
  if (
    change &&
    token(change.observationId) &&
    typeof change.requestId === "string"
  ) {
    const { action, observationId, requestId, inputId } = change;
    const count = Object.keys(change).length;
    const basis = { observationId, requestId };
    if (action === "resume" && count === 3) return { ...basis, action };
    if (typeof inputId === "string") {
      if (action === "withdraw" && count === 4)
        return { ...basis, action, inputId };
      if (
        action === "replace" &&
        count === 5 &&
        typeof change.text === "string"
      )
        return { ...basis, action, inputId, text: change.text };
      if (
        action === "move" &&
        count === 5 &&
        (change.direction === "up" || change.direction === "down")
      )
        return { ...basis, action, inputId, direction: change.direction };
    }
  }
  throw new Error("native_chat_queue_change_invalid");
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
