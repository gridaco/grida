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
