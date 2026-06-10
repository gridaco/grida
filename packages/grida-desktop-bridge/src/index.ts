/**
 * GRIDA-SEC-004 — renderer-visible Desktop bridge protocol.
 *
 * This package carries only the `window.grida` contract that a URL-loaded
 * renderer may compile against. Electron IPC channel names and native
 * implementation details stay in the Desktop app; AgentHost HTTP stays in
 * `@grida/agent/transport`.
 */

import type {
  AgentRunOptions,
  AgentServerHandshakeResponse,
  AgentUIMessageChunk,
  ByokProviderId,
  ChatMessageWithParts,
  ChatSessionRow,
  CreateSessionOptions,
  FileReadResult,
  FileWriteResult,
  PatchSessionOptions,
  RecentEntry,
  RewindResult,
  SessionListFilter,
  SessionListPage,
  SessionStatus,
  Workspace,
  WorkspaceFsEntry,
  WorkspaceReadFileBytesResult,
  WorkspaceReadFileResult,
  WorkspaceWriteFileResult,
} from "@grida/agent";

export const DESKTOP_BRIDGE_PROTOCOL = 1 as const;

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
};

export type DesktopCapabilities = {
  native: DesktopNativeCapabilities;
};

export type HandshakeResponse = AgentServerHandshakeResponse;

export type {
  FileReadResult,
  FileWriteResult,
  RecentEntry,
  Workspace,
  WorkspaceFsEntry,
  WorkspaceReadFileBytesResult,
  WorkspaceReadFileResult,
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

export type DesktopBridge = {
  protocol: typeof DESKTOP_BRIDGE_PROTOCOL;
  app: { version: string; platform: string };
  caps: DesktopCapabilities;
  handshake: () => Promise<HandshakeResponse>;
  window: {
    set_document_edited: (edited: boolean) => Promise<void>;
    set_represented_filename: (filePath: string) => Promise<void>;
    close: () => Promise<void>;
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
  workspaces: {
    list: () => Promise<Workspace[]>;
    open: (rootPath: string) => Promise<Workspace>;
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
    read_file_bytes: (
      workspaceId: string,
      relPath: string
    ) => Promise<WorkspaceReadFileBytesResult>;
    write_file: (
      workspaceId: string,
      relPath: string,
      content: string
    ) => Promise<WorkspaceWriteFileResult>;
    /**
     * Move a workspace entry (file or folder) to the OS trash
     * (recoverable; a folder takes its whole subtree). Unlike the sibling
     * fs methods — which route to the agent sidecar — this is a host
     * capability: the desktop main process performs the native trash
     * after re-validating that `relPath` resolves inside the workspace
     * root (and isn't the root itself). Renderers must confirm with the
     * user first.
     */
    trash_entry: (workspaceId: string, relPath: string) => Promise<void>;
  };
  /**
   * GRIDA-SEC-004 — human-interactive terminal. A real, unsandboxed
   * login PTY on the user's own machine (VSCode trust model: the human
   * is allowed to run anything as themselves). This is deliberately
   * NOT the agent's shell — the agent's `run_command` stays confined
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
    has: (providerId: ByokProviderId) => Promise<boolean>;
    set: (providerId: ByokProviderId, key: string) => Promise<void>;
    delete: (providerId: ByokProviderId) => Promise<void>;
  };
  agent: {
    run: (
      opts: AgentRunOptions,
      onChunk: (chunk: AgentUIMessageChunk) => void
    ) => Promise<{
      stream_id: string;
      session_id: string;
      done: Promise<void>;
    }>;
    abort: (sessionId: string) => Promise<void>;
    reconnect: (
      sessionId: string,
      lastEventId: number,
      onChunk: (chunk: AgentUIMessageChunk) => void
    ) => Promise<{
      stream_id: string;
      session_id: string;
      done: Promise<void>;
    } | null>;
  };
  sessions: {
    list: (filter?: SessionListFilter) => Promise<SessionListPage>;
    get: (id: string) => Promise<ChatSessionRow | null>;
    create: (opts: CreateSessionOptions) => Promise<ChatSessionRow>;
    patch: (id: string, opts: PatchSessionOptions) => Promise<ChatSessionRow>;
    delete: (id: string) => Promise<void>;
    list_messages: (id: string) => Promise<ChatMessageWithParts[]>;
    /** Soft-truncate to a prior message (`restore: true` un-rewinds). */
    rewind: (
      id: string,
      fromMessageId: string,
      opts?: { restore?: boolean }
    ) => Promise<RewindResult>;
    /** Fork the session at a message; resolves to the new forked session. */
    fork: (
      id: string,
      fromMessageId: string,
      metadata?: Record<string, unknown>
    ) => Promise<ChatSessionRow>;
    /** User-fired compaction. */
    compact: (id: string) => Promise<{
      compacted: boolean;
      reason?: string;
      summary_message_id?: string;
    }>;
    /** Queued sends: enqueue a pending user message (held out of the model
     *  view + transcript until it fires). The caller mints the id. */
    enqueue: (
      id: string,
      message: { id?: string; text: string }
    ) => Promise<ChatMessageWithParts>;
    /** The pending queue, FIFO by `queued_at`. */
    list_queued: (id: string) => Promise<ChatMessageWithParts[]>;
    /** Cancel a queued message before it fires. */
    cancel_queued: (id: string, messageId: string) => Promise<void>;
    /**
     * Subscribe to the session's run-state (RFC `session` §Session status):
     * the current status arrives first, then every idle⇄busy⇄error
     * transition. Returns a `subscription_id` to later
     * {@link unsubscribe_status}, and a `done` that settles when the
     * subscription ends.
     */
    subscribe_status: (
      id: string,
      onStatus: (status: SessionStatus) => void
    ) => Promise<{ subscription_id: string; done: Promise<void> }>;
    /** Stop a status subscription started by {@link subscribe_status}. */
    unsubscribe_status: (subscriptionId: string) => Promise<void>;
  };
};
