// GRIDA-GG: desktop — the optional `gg` bridge namespace (docs/wg/platform/hosted-ai.md)
// GRIDA-SEC-008 — renderer-safe ChatGPT status/control DTOs only.
/**
 * GRIDA-SEC-004 — renderer-visible Desktop bridge protocol.
 *
 * This package carries the `window.grida` contract and public Desktop version
 * compatibility metadata. Electron IPC channel names and native implementation
 * details stay in the Desktop app; daemon HTTP stays in `@grida/daemon/transport`
 * + `@grida/ai-host/media-transport`.
 */

import type {
  ProviderId,
  EndpointProviderConfig,
  GGModelsView,
  VisualModelCatalogueView,
  ProbedEndpointModel,
  ImageGenerateRequest,
  ImageGenerateResult,
  VideoGenerateRequest,
  VideoGenerateResult,
  RigCheckRequest,
  RigCheckResult,
  RiggingGenerateRequest,
  RiggingGenerateResult,
  ModelGenerationGenerateRequest,
  ModelGenerationGenerateResult,
  ThreeDGenerateRequest,
  ThreeDGenerateResult,
  MusicGenerateRequest,
  MusicGenerateResult,
  SoundEffectGenerateRequest,
  SoundEffectGenerateResult,
  TextToSpeechGenerateRequest,
  TextToSpeechGenerateResult,
  TextToSpeechListVoicesResult,
  ChatGptSubscriptionStatus,
  GridaGatewaySession,
  GridaGatewaySessionStatus,
} from "@grida/ai-host";
import type {
  DaemonHandshakeResponse,
  FileReadResult,
  FileWriteResult,
  MediaItem,
  RecentEntry,
  Workspace,
  WorkspaceCreateInput,
  WorkspaceFsEntry,
  WorkspaceReadFileBytesResult,
  WorkspaceReadFileResult,
  WorkspaceReadSvgDocumentResult,
  WorkspaceWriteFileResult,
} from "@grida/daemon";

import type {
  DesktopHooks,
  DesktopNativeChat,
  NativeChatReadState,
} from "./native-chat";
import type { DesktopNativeExternalAgent } from "./native-external-agent";
import type { NativeEditorSurfaceSnapshot } from "./native-editor-surfaces";
import type { DesktopBrowser } from "./browser";
import type { DesktopFxViewer } from "./fx-viewer";
import type { DesktopVoice } from "./voice";

export { DesktopBrowser } from "./browser";
export * from "./voice";
export { WebPreview } from "./web-preview";
export { DesktopCompatibility } from "./compatibility";
export type { DesktopFxViewer } from "./fx-viewer";
export type * from "./native-chat";
export {
  NATIVE_CHAT_MAX_ATTACHMENTS,
  NATIVE_CHAT_MAX_ATTACHMENT_IMAGE_BYTES,
} from "./native-chat";
export * from "./native-chat-message-context";
export type * from "./native-external-agent";
export type * from "./native-subagents";
export { NativeEditorSurfaces } from "./native-editor-surfaces";
export {
  NativeEditorSelection,
  NativeEditorSelection as NativeEditorSvgSelection,
} from "./native-editor-selection";
export { NativeEditorSvgText } from "./native-editor-svg-text";
export type {
  NativeEditorSurfaceOpen,
  NativeEditorSurfaceSnapshot,
} from "./native-editor-surfaces";

export const DESKTOP_BRIDGE_PROTOCOL = 1 as const;

export type DesktopSettingsSection = "models" | "voice";

export type DesktopNativeCapabilities = {
  host_apps: boolean;
  window: boolean;
  dialog: boolean;
  shell: boolean;
  /**
   * Human-interactive terminal (PTY) pane. Added after protocol 1
   * shipped — renderers must treat a missing/falsy value as "old
   * desktop binary, no terminal" and hide the surface.
   */
  terminal: boolean;
  /**
   * Workspace file-change watcher — `workspaces.subscribe_changes`.
   * Added after protocol 1 shipped; treat a missing/falsy value as "old
   * desktop binary" and fall back to manual/pull refresh.
   */
  workspace_watch: boolean;
  /** Optional browser; negotiate its version and presentation before use. */
  browser?: boolean;
  /** Named OpenAI API project key custody and native chat support. */
  openai_api?: boolean;
};

export type DesktopCapabilities = {
  native: DesktopNativeCapabilities;
  /** Bundled media capabilities; omission means an older Desktop binary. */
  media?: {
    /** Direct image generation using the OpenAI project key. */
    openai_images?: boolean;
    /** First-party Tripo credentials, generation and host-authorized egress. */
    tripo?: boolean;
    /** Explicit eligibility and rigging plus bounded native GLB upload. */
    rigging?: boolean;
    /** Grida credits for Tripo generation, including native signed uploads. */
    tripo_gg?: boolean;
    /** Grida credits for eligibility and rigging, including native signed uploads. */
    rigging_gg?: boolean;
  };
};

export type HandshakeResponse = DaemonHandshakeResponse;

export type {
  FileReadResult,
  FileWriteResult,
  MediaItem,
  RecentEntry,
  Workspace,
  WorkspaceCreateInput,
  WorkspaceFsEntry,
  WorkspaceReadFileBytesResult,
  WorkspaceReadFileResult,
  WorkspaceReadSvgDocumentResult,
  WorkspaceWriteFileResult,
};

export type ConfirmOptions = {
  message: string;
  detail?: string;
  buttons: string[];
  default_id?: number;
  cancel_id?: number;
};

export type FileFilter = { name: string; extensions: string[] };

export type OpenDialogOptions = {
  default_path?: string;
  filters?: FileFilter[];
  properties?: Array<
    "openFile" | "openDirectory" | "multiSelections" | "createDirectory"
  >;
};

export type SaveDialogOptions = {
  default_path?: string;
  filters?: FileFilter[];
};

export type NavigationState = {
  can_go_back: boolean;
  can_go_forward: boolean;
  /** Present when the previous Desktop history entry is the plain Home route. */
  back_destination?: "home";
  /** Present when the next Desktop history entry is the plain Home route. */
  forward_destination?: "home";
};

export const DESKTOP_HOST_APP_IDS = [
  "finder",
  "vscode",
  "cursor",
  "sublime",
  "terminal",
  "warp",
  "xcode",
] as const;

export type DesktopHostAppId = (typeof DESKTOP_HOST_APP_IDS)[number];

export type DesktopHostAppInfo = {
  id: DesktopHostAppId;
  label: string;
  installed: boolean;
  supports: Array<"workspace">;
};

/**
 * Result of starting the native ChatGPT sign-in ceremony.
 *
 * A completed connection preserves the existing secret-free status shape.
 * An explicit user cancellation resolves as the closed `cancelled` outcome;
 * every other failure still rejects the operation.
 */
export type ChatGptConnectResult =
  | (ChatGptSubscriptionStatus &
      Readonly<{
        outcome?: never;
      }>)
  | Readonly<{
      outcome: "cancelled";
    }>;

/**
 * A single coalesced external change under a watched workspace root.
 * `kind` is intentionally coarse — the renderer reacts by
 * re-reading the affected path / re-listing its parent, so it doesn't
 * need byte-level deltas. A rename surfaces as `deleted` (old path) +
 * `added` (new path) in v1.
 */
export type WorkspaceChangeEvent = {
  kind: "added" | "changed" | "deleted";
  /** Workspace-relative POSIX path of the changed entry. */
  rel_path: string;
};

/** Receives coalesced batches of {@link WorkspaceChangeEvent}. */
export type WorkspaceChangeHandler = (events: WorkspaceChangeEvent[]) => void;

export type TerminalCreateOptions = {
  /** Workspace whose root becomes the shell's cwd. Resolved host-side
   * from the sidecar registry — the renderer never passes a raw path. */
  workspace_id: string;
  cols: number;
  rows: number;
};

export type TerminalHandlers = {
  /** Raw PTY output frames, in order. */
  on_data: (data: string) => void;
  /** Fires once when the shell process exits; no more frames after. */
  on_exit: (info: { exit_code: number }) => void;
};

/** Renderer-safe media bytes returned by the native Desktop host. */
export type DesktopMediaReadResult = {
  item: MediaItem;
  /** Structured-clone byte buffer; avoids a second base64 expansion in IPC. */
  bytes: ArrayBuffer;
};

export type DesktopMediaSaveCopyResult = "saved" | "cancelled" | "failed";

/** Unarchived workspace chats, ordered by their latest saved conversation message. */
export type DesktopChatCatalogQuery = Readonly<{
  /** Omit to include all registered workspaces visible to this client. */
  workspaceId?: string;
  cursor?: string | null;
  /** From 1 to 32, default 32. */
  limit?: number;
}>;

export type DesktopChatCatalogEntry = Readonly<{
  workspaceId: string;
  sessionId: string;
  title: string | null;
  /** Null when no message time was recorded. Undated entries follow dated entries. */
  lastMessageAtMs: number | null;
  lastActivityAtMs?: number;
  readState?: NativeChatReadState;
  running: boolean;
  /** Present when the native host reports answerable waits independently of running status. */
  inputNeeded?: boolean;
}>;

export type DesktopChatCatalogPage = Readonly<{
  entries: readonly DesktopChatCatalogEntry[];
  nextCursor: string | null;
}>;

/** Metadata-only Settings view; ids are opaque native-issued handles. */
export type DesktopArchivedChat = Readonly<{
  id: string;
  workspace: string;
  title: string | null;
  revision: number;
  /** Latest local turn's settlement or start time, when available. */
  lastActivityAtMs?: number;
}>;

export type DesktopArchivedChatPage = Readonly<{
  entries: readonly DesktopArchivedChat[];
  nextCursor: string | null;
  /** Registered workspaces whose metadata is temporarily unavailable. */
  unavailableWorkspaces?: readonly string[];
}>;

export type DesktopPersonalizationSettings = Readonly<{
  suggestedPrompts: boolean;
  /** The existing IPC value "live" represents automatic search. */
  webSearch: "disabled" | "live";
  revision: number;
}>;

export type DesktopPersonalizationChange =
  | Readonly<{ suggestedPrompts: boolean }>
  | Readonly<{ webSearch: DesktopPersonalizationSettings["webSearch"] }>
  /** Older renderers use "onDemand" to turn automatic search off. */
  | Readonly<{ webSearch: "onDemand" }>;

export type DesktopComposerPredictionSettings = Readonly<{
  enabled: boolean;
  revision: number;
}>;

export type DesktopBridge = {
  protocol: typeof DESKTOP_BRIDGE_PROTOCOL;
  app: { version: string; platform: string };
  caps: DesktopCapabilities;
  /** Older installed protocol-1 hosts omit this standalone capability. */
  browser?: DesktopBrowser.Bridge;
  handshake: () => Promise<HandshakeResponse>;
  nativeChat?: DesktopNativeChat;
  /** User-wide preferences shared by Settings and regular workspace chats. */
  personalization?: {
    get(): Promise<DesktopPersonalizationSettings>;
    set(
      change: DesktopPersonalizationChange
    ): Promise<DesktopPersonalizationSettings>;
    onChange(
      listener: (settings: DesktopPersonalizationSettings) => void
    ): () => void;
  };
  /** User-wide Desktop preference. Only the Settings window can change it. */
  composerPredictions?: {
    get(): Promise<DesktopComposerPredictionSettings>;
    set(enabled: boolean): Promise<DesktopComposerPredictionSettings>;
    onChange(
      listener: (value: DesktopComposerPredictionSettings) => void
    ): () => void;
  };
  /** Metadata discovery for Home and the workbench. Older hosts omit this capability. */
  chatCatalog?: {
    list(query?: DesktopChatCatalogQuery): Promise<DesktopChatCatalogPage>;
    observe?(
      scope: Pick<DesktopChatCatalogQuery, "workspaceId">,
      onChanged: () => void
    ): Promise<(() => void) | null>;
  };
  /** GPT-Transcribe dictation owned by Desktop Main. Absent on older builds. */
  voice?: DesktopVoice;
  /** Global config.toml hooks. Absent on older native builds. */
  hooks?: DesktopHooks;
  /** Fixed Settings archive operations, absent on older protocol-1 hosts. */
  archives?: {
    list: (cursor?: string | null) => Promise<DesktopArchivedChatPage>;
    unarchive: (id: string, revision: number) => Promise<void>;
    /** Opens the chat restored from this Settings window using the same row id. */
    openRestored?: (id: string) => Promise<void>;
  };
  nativeExternalAgent?: DesktopNativeExternalAgent;
  /**
   * Grida account lifecycle owned by the native entry controller. Optional
   * because older protocol-1 hosts let individual renderer windows sign out
   * independently.
   */
  account?: {
    sign_out: () => Promise<void>;
  };
  /**
   * Purpose-scoped first-run workspace setup owned by Electron main.
   *
   * This namespace intentionally does not expose the daemon connection tuple
   * or a generic filesystem dialog. It is optional because protocol-1 hosts
   * shipped before the native onboarding role.
   */
  onboarding?: {
    get_default_workspace: () => Promise<Workspace | null>;
    choose_workspace: () => Promise<Workspace | null>;
  };
  window: {
    set_document_edited: (edited: boolean) => Promise<void>;
    set_represented_filename: (filePath: string) => Promise<void>;
    close: () => Promise<void>;
    /**
     * Open or focus the native Settings window without navigating this window.
     * Optional because older protocol-1 hosts expose no Settings action.
     */
    open_settings?: () => Promise<void>;
    /** Open the LLM Providers section of the native Settings window. */
    open_llm_provider_settings?: () => Promise<void>;
    /** Open the Voice section of the native Settings window. */
    open_voice_settings?: () => Promise<void>;
    /**
     * Finish the dedicated onboarding surface and promote the same entry
     * BrowserWindow to the regular workstation. Optional because older
     * protocol-1 hosts predate the native onboarding route.
     */
    complete_onboarding?: (workspaceId?: string) => Promise<void>;
    navigation: {
      state: () => Promise<NavigationState>;
      subscribe: (cb: (state: NavigationState) => void) => () => void;
      back: () => Promise<void>;
      forward: () => Promise<void>;
    };
  };
  dialog: {
    confirm: (opts: ConfirmOptions) => Promise<number>;
    open: (opts: OpenDialogOptions) => Promise<string[] | null>;
    save_as: (opts: SaveDialogOptions) => Promise<string | null>;
  };
  shell: {
    open_external: (url: string) => Promise<void>;
    show_item_in_folder: (filePath: string) => Promise<void>;
    get_path_for_file: (file: File) => string;
  };
  files: {
    read: (docId: string) => Promise<FileReadResult>;
    write: (docId: string, content: string) => Promise<FileWriteResult>;
  };
  recent: {
    list: () => Promise<RecentEntry[]>;
    touch: (path: string) => Promise<void>;
    pin: (path: string, pinned: boolean) => Promise<void>;
    forget: (path: string) => Promise<void>;
  };
  /**
   * App-managed, durable media library. Optional because protocol-1 Desktop
   * builds predate it. Every operation is purpose-scoped: the renderer names
   * only an opaque item id and never receives or supplies a native path.
   */
  media?: {
    list: () => Promise<MediaItem[]>;
    read: (id: string) => Promise<DesktopMediaReadResult>;
    save_copy?: (id: string) => Promise<DesktopMediaSaveCopyResult>;
    reveal: (id: string) => Promise<void>;
    open_folder: () => Promise<void>;
  };
  workspaces: {
    list: () => Promise<Workspace[]>;
    publish_editor_surfaces?: (
      snapshot: NativeEditorSurfaceSnapshot
    ) => Promise<boolean>;
    automation?: {
      readonly version: 1;
      publish(
        snapshot: NativeEditorSurfaceSnapshot,
        activePageId: string | null,
        viewId?: number
      ): Promise<boolean>;
      /** Retire this document's workbench publication before switching views. */
      retire?(viewId: number): Promise<boolean>;
      onOpenFile(
        handler: (request: {
          path: string;
          expiresAtMs: number;
          viewId?: number;
        }) => void
      ): () => void;
    };
    /** User-authorized workbench intent. A viewer event alone grants no native file access. */
    prepareFxFile?: (
      request: DesktopFxViewer.FileRequest
    ) => Promise<DesktopFxViewer.FileResult>;
    /** Resolve a portable preview reference in this workbench's registered workspace. */
    resolveFxPreview?: (
      entry: DesktopFxViewer.Entry
    ) => Promise<DesktopFxViewer.Preview>;
    /** Open the exact directory selected in a native folder picker. */
    choose?: () => Promise<Workspace | null>;
    open: (rootPath: string) => Promise<Workspace>;
    /**
     * Auto-create a fresh project (managed root, seeded `.canvas` board) and
     * register it — the desktop home's "auto-create, ask nothing" flow. No OS
     * folder dialog. Rejects when the host wired no managed root.
     */
    create: (input: WorkspaceCreateInput) => Promise<Workspace>;
    pin: (id: string, pinned: boolean) => Promise<void>;
    forget: (id: string) => Promise<void>;
    readdir: (
      workspaceId: string,
      relPath?: string
    ) => Promise<WorkspaceFsEntry[]>;
    read_file: (
      workspaceId: string,
      relPath: string
    ) => Promise<WorkspaceReadFileResult>;
    /** Read SVG document source with its own finite allowance. Older hosts omit this method. */
    read_svg_document?: (
      workspaceId: string,
      relPath: string
    ) => Promise<WorkspaceReadSvgDocumentResult>;
    read_file_bytes: (
      workspaceId: string,
      relPath: string
    ) => Promise<WorkspaceReadFileBytesResult>;
    /**
     * Resolve a streamable media `src` URL for `relPath`, for the read-only
     * image/video viewer. Synchronous and pure — it builds a URL the
     * host can serve, no I/O. On desktop this is a `grida-workspace://`
     * privileged-scheme URL backed by a streamed, Range-capable file route, so
     * the viewer is size-independent (no 1 MiB base64 cap) and video seeking
     * works.
     *
     * OPTIONAL: when the host omits this capability, the viewer uses
     * {@link read_file_bytes}.
     */
    media_url?: (workspaceId: string, relPath: string) => string;
    /**
     * Write `content` to `relPath`. `expectedMtime` is the optimistic-
     * concurrency token: the mtime the renderer last
     * observed for this file. When supplied and the file on disk has
     * advanced past it, the host rejects with a 409 `modified-since`
     * error instead of silently clobbering the external change. Omit it
     * for force-overwrite / first-time-create / last-writer-wins.
     */
    write_file: (
      workspaceId: string,
      relPath: string,
      content: string,
      expectedMtime?: number
    ) => Promise<WorkspaceWriteFileResult>;
    /**
     * Move a workspace entry (file or folder) to the OS trash
     * (recoverable; a folder takes its whole subtree). Unlike the sibling
     * fs methods — which route to the services sidecar — this is a host
     * capability: the desktop main process performs the native trash
     * after re-validating that `relPath` resolves inside the workspace
     * root (and isn't the root itself). Renderers must confirm with the
     * user first.
     */
    trash_entry: (workspaceId: string, relPath: string) => Promise<void>;
    /**
     * Subscribe to external file-system changes under the workspace root.
     * The host watches the real directory tree and pushes
     * coalesced batches of {@link WorkspaceChangeEvent} — covering edits
     * made outside the editor, including the agent's own writes. Like
     * `trash_entry` this is a native host capability (the OS watcher lives
     * in the desktop main process), not a services-sidecar operation.
     *
     * `subscribe_changes` registers `on_change` before the OS watch
     * starts (caller-mints-id, mirroring `terminal.create`) so an early
     * event can't race the subscription. Resolves with the id used to
     * {@link unsubscribe_changes}. Additive on protocol 1 — gate the UI on
     * `caps.native.workspace_watch`; older binaries lack the channel.
     */
    subscribe_changes: (
      workspaceId: string,
      on_change: WorkspaceChangeHandler
    ) => Promise<{ subscription_id: string }>;
    /** Stop a subscription started by {@link subscribe_changes}. */
    unsubscribe_changes: (subscriptionId: string) => Promise<void>;
  };
  /**
   * GRIDA-SEC-004 — human-interactive terminal. A real, unsandboxed
   * login PTY on the user's own machine (VSCode trust model: the human
   * is allowed to run anything as themselves). This is deliberately
   * NOT the agent's shell — the agent's `exec_command` stays confined
   * behind the srt sandbox and is never wired to this surface.
   *
   * `create` registers `handlers` before the PTY spawns, so no output
   * frame is lost. The shell's cwd is the workspace root; the user may
   * `cd` freely once open. Killed on window close — no reattach (v1).
   */
  terminal: {
    create: (
      opts: TerminalCreateOptions,
      handlers: TerminalHandlers
    ) => Promise<{ id: string }>;
    write: (id: string, data: string) => Promise<void>;
    resize: (id: string, cols: number, rows: number) => Promise<void>;
    kill: (id: string) => Promise<void>;
  };
  host_apps: {
    resolve_preferred: (opts: {
      workspace_id: string;
      preferred_apps?: DesktopHostAppId[];
    }) => Promise<DesktopHostAppInfo[]>;
    open_workspace: (opts: {
      workspace_id: string;
      app_id: DesktopHostAppId;
    }) => Promise<void>;
  };
  secrets: {
    has: (providerId: ProviderId) => Promise<boolean>;
    set: (providerId: ProviderId, key: string) => Promise<void>;
    delete: (providerId: ProviderId) => Promise<void>;
  };
  /**
   * Endpoint provider config — user-configured OpenAI-
   * compatible endpoints (Ollama preset, self-hosted gateways). Plain
   * readable config, unlike `secrets`: list returns full configs.
   * Optional — older desktop binaries don't carry it; renderers must
   * feature-detect and hide the surface when absent.
   */
  providers?: {
    /** Anonymous metadata is read by the native host; absent on older builds. */
    gg_models?: () => Promise<GGModelsView>;
    visual_models?: () => Promise<VisualModelCatalogueView>;
    list_endpoints: () => Promise<EndpointProviderConfig[]>;
    /** Explicit Connect/Save consents to this exact saved destination. New
     * hosts retain that consent across restarts without another dialog. */
    set_endpoint: (config: EndpointProviderConfig) => Promise<void>;
    /** Non-minting status for the exact saved id and canonical full base URL.
     * Absent on hosts with the former per-launch native approval flow. */
    endpoint_authorization?: (id: string, baseUrl: string) => Promise<boolean>;
    /** Background discovery merges only detected model fields on an existing,
     * authorized destination. Missing, replaced or unapproved configs reject.
     * Human overrides, the default model and other saved configuration are preserved. */
    update_endpoint_models?: (update: {
      id: string;
      base_url: string;
      models: ProbedEndpointModel[];
    }) => Promise<void>;
    delete_endpoint: (id: string) => Promise<void>;
    /** Where the endpoint config JSON lives (the hand-editable file). */
    info: () => Promise<{ path: string }>;
    /** Discover the models an endpoint serves. New hosts require matching
     * saved consent; this read never authorizes an unsaved destination. */
    probe_endpoint: (baseUrl: string) => Promise<{
      source: "ollama" | "openai";
      models: ProbedEndpointModel[];
    }>;
  };
  /**
   * Grida hosted ("included") AI session — GRIDA-SEC-006. Push-only
   * custody: the renderer mints the short-lived scoped token from the
   * webview session and pushes it to the sidecar; `status` reports
   * presence/expiry/org and NEVER the token. Optional — older binaries
   * lack it; renderers feature-detect and show no hosted-AI affordances
   * when absent.
   */
  gg?: {
    set_session: (session: GridaGatewaySession) => Promise<void>;
    clear_session: () => Promise<void>;
    status: () => Promise<GridaGatewaySessionStatus>;
  };
  /**
   * Native ChatGPT-subscription provider control surface. OAuth credentials,
   * authorization codes, PKCE material, and provider access tokens stay in
   * Electron main + the services sidecar; only secret-free status crosses into
   * the renderer. Optional because protocol-1 Desktop builds predate it.
   */
  chatgpt?: {
    connect: () => Promise<ChatGptConnectResult>;
    cancel: () => Promise<void>;
    status: () => Promise<ChatGptSubscriptionStatus>;
    sign_out: () => Promise<ChatGptSubscriptionStatus>;
  };
  /**
   * BYOK image generation. Desktop-only: the request resolves the
   * user's connected provider key inside the sidecar and returns base64 image
   * bytes — never the key. Optional — older binaries lack it; renderers
   * feature-detect and hide the surface when absent.
   */
  images?: {
    generate: (req: ImageGenerateRequest) => Promise<ImageGenerateResult>;
  };
  /**
   * BYOK video generation. Desktop-only; resolves the user's key in the
   * sidecar and returns base64 video bytes — never a provider URL or the key.
   * Optional — older binaries lack it; renderers feature-detect.
   */
  video?: {
    generate: (req: VideoGenerateRequest) => Promise<VideoGenerateResult>;
  };
  /** Optional on older hosts; requires caps.media.rigging and both methods. */
  rigging?: {
    check: (req: RigCheckRequest) => Promise<RigCheckResult>;
    generate: (req: RiggingGenerateRequest) => Promise<RiggingGenerateResult>;
  };
  /** Optional on older hosts; also requires caps.media.tripo. */
  modelGeneration?: {
    generate: (
      req: ModelGenerationGenerateRequest
    ) => Promise<ModelGenerationGenerateResult>;
  };
  /**
   * BYOK 3D generation. Optional because protocol-1 Desktop builds predate
   * the route; renderer code must feature-detect the namespace.
   */
  threeD?: {
    generate: (req: ThreeDGenerateRequest) => Promise<ThreeDGenerateResult>;
  };
  /**
   * Audio-output generation taxonomy. Music, sound effects, and text-to-speech
   * are independent optional capabilities because their providers,
   * availability, and request contracts differ. The parent is optional for
   * older Desktop hosts.
   */
  audio?: {
    music?: {
      generate: (req: MusicGenerateRequest) => Promise<MusicGenerateResult>;
    };
    soundEffects?: {
      generate: (
        req: SoundEffectGenerateRequest
      ) => Promise<SoundEffectGenerateResult>;
    };
    textToSpeech?: {
      listVoices: () => Promise<TextToSpeechListVoicesResult>;
      generate: (
        req: TextToSpeechGenerateRequest
      ) => Promise<TextToSpeechGenerateResult>;
    };
  };
};
