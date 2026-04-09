/**
 * @grida/canvas-sync
 *
 * Server-authoritative document sync for Grida Canvas.
 *
 * @example
 * ```ts
 * import { SyncClient, WebSocketTransport } from "@grida/canvas-sync";
 *
 * const transport = new WebSocketTransport({
 *   url: "wss://live.grida.co/room/my-room",
 * });
 *
 * const client = new SyncClient({
 *   schema: "0.91.0-beta+20260311",
 *   transport,
 *   initialState: { nodes: {}, scenes: [] },
 * });
 *
 * client.on("stateChange", (state) => {
 *   // Update the editor with the new state
 * });
 *
 * client.connect();
 * ```
 */

// Protocol types
export type {
  NodeId,
  JsonValue,
  FieldOp,
  FieldPut,
  FieldDelete,
  SerializedNode,
  NodeOp,
  NodePut,
  NodePatch,
  NodeRemove,
  SceneOp,
  SceneAdd,
  SceneRemove,
  SceneReorder,
  DocumentDiff,
  CursorPresence,
  PresenceState,
  ClientMessage,
  ConnectMessage,
  PushMessage,
  PingMessage,
  PresenceUpdateMessage,
  ServerMessage,
  ConnectOkMessage,
  PushOkMessage,
  PatchMessage,
  PresenceBroadcastMessage,
  PongMessage,
  ErrorMessage,
  PushResult,
} from "./protocol";

// Diff operations
export {
  computeDiff,
  applyDiff,
  composeDiffs,
  isDiffEmpty,
  jsonEqual,
} from "./diff";
export type { DocumentState } from "./diff";

// Validation
export { validateDiff } from "./validate";
export type {
  ValidationResult,
  ValidationError,
  ValidationErrorCode,
} from "./validate";

// Clock
export { DocumentClock } from "./clock";

// Transport
export { WebSocketTransport } from "./transport";
export type {
  ISyncTransport,
  TransportStatus,
  WebSocketTransportOptions,
} from "./transport";

// Presence
export { mergePresence, hasVisibleCursor } from "./presence";

// Client
export { SyncClient } from "./client";
export type {
  SyncClientOptions,
  SyncClientStatus,
  SyncClientEventMap,
} from "./client";
