/**
 * AgentHost route DTOs for local resources.
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
};

export type WorkspaceFsEntry = {
  name: string;
  rel_path: string;
  kind: "file" | "directory" | "symlink" | "other";
};

/**
 * Wire input for `POST /workspaces/create` (auto-create). A field-constrained
 * board seed — only a document's `src` (a bundle-relative path or an `https://`
 * reference) and an optional layout box, never a raw manifest (GRIDA-SEC-004).
 * The host re-validates this shape server-side before it touches disk.
 */
export type WorkspaceCreateSeedDocument = {
  src: string;
  layout?: { x?: number; y?: number; w?: number; h?: number; z?: number };
};
export type WorkspaceCreateInput = {
  /** Friendly name → slugified into the folder segment. Defaults to "Untitled". */
  name?: string;
  /** Documents to place on the fresh board (e.g. a picked reference). */
  seed?: { documents: WorkspaceCreateSeedDocument[] };
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
