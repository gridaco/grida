/**
 * DaemonServer route DTOs for local resources.
 *
 * These are plain client-safe shapes shared by the transport client,
 * Desktop bridge contract, and HTTP route tests. Storage classes live behind
 * the server; these are the wire/read-model shapes.
 */

export type FileRegisterResult = { doc_id: string };

export type FileReadResult = {
  content: string;
  mtime: number;
  filename: string;
  display_path: string;
};

export type FileWriteResult = { mtime: number };

export type RecentEntry = {
  path: string;
  pinned: boolean;
  opened_at: number;
};

export type Workspace = {
  id: string;
  root: string;
  name: string;
  opened_at: number;
  pinned: boolean;
  /** True for the host's DEFAULT workspace (the managed root itself, e.g.
   *  `~/Documents/Grida`). The desktop home roots a fresh session here instead
   *  of minting a per-session folder. Computed per `list()`, never persisted;
   *  absent on hosts with no managed root. */
  is_default?: boolean;
};

export type WorkspaceFsEntry = {
  name: string;
  rel_path: string;
  kind: "file" | "directory" | "symlink" | "other";
};

/**
 * Wire input for `POST /workspaces/create` (auto-create). Creates an EMPTY
 * project directory — no document is seeded. Whether the workspace becomes a
 * board, a slides deck, or a tree of files is the agent's choice on its first
 * turn, not the caller's; so there is nothing here to inject (GRIDA-SEC-004).
 */
export type WorkspaceCreateInput = {
  /** Friendly name → slugified into the folder segment. Defaults to "Untitled". */
  name?: string;
};

export type WorkspaceReadFileResult = {
  content: string;
  mtime: number;
};

export type WorkspaceReadFileBytesResult = {
  base64: string;
  size: number;
  mtime: number;
};

export type WorkspaceWriteFileResult = { mtime: number };
