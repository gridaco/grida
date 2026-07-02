// Curated client-safe root surface — explicit named re-exports only, no
// star. Anything not listed here is internal; promote on dogfooding.
// Node-only code (DaemonServer, Daemon discovery, transport) ships from
// the `./server` and `./transport` subpaths.

export {
  DAEMON_DEFAULT_CAPABILITIES,
  DAEMON_PROTOCOL,
  type DaemonCapabilities,
  type DaemonHandshakeResponse,
} from "./protocol/handshake";
export type {
  FileRegisterResult,
  FileReadResult,
  FileWriteResult,
  RecentEntry,
  Workspace,
  WorkspaceCreateInput,
  WorkspaceFsEntry,
  WorkspaceReadFileBytesResult,
  WorkspaceReadFileResult,
  WorkspaceWriteFileResult,
} from "./protocol/resources";
