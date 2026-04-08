/**
 * @module protocol
 *
 * Wire protocol types for the Grida Canvas sync system.
 *
 * This module defines the contract between SyncClient (browser) and
 * SyncRoom (Cloudflare Durable Object). All types here are pure data —
 * no behavior, no dependencies beyond JSON-serializable primitives.
 *
 * The protocol is server-authoritative: the server validates and may
 * modify pushed diffs before committing them. Clients optimistically
 * apply their own changes and rebase when the server responds.
 */

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

/** Node identifier — currently a string, will migrate to packed u32 later. */
export type NodeId = string;

// ---------------------------------------------------------------------------
// JSON primitives
// ---------------------------------------------------------------------------

/**
 * Any JSON-serializable value. Used for field values in diffs.
 * Intentionally loose — validation is done by {@link validate}.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

// ---------------------------------------------------------------------------
// Field-level operations
// ---------------------------------------------------------------------------

/** Replace a field's value. */
export interface FieldPut {
  readonly op: "put";
  readonly value: JsonValue;
}

/** Delete (unset) a field. */
export interface FieldDelete {
  readonly op: "delete";
}

/** A single field-level operation. */
export type FieldOp = FieldPut | FieldDelete;

// ---------------------------------------------------------------------------
// Node-level operations
// ---------------------------------------------------------------------------

/**
 * Serialized node — a plain JSON object representing a full node snapshot.
 * The `type` discriminant and `id` are always present.
 */
export interface SerializedNode {
  readonly type: string;
  readonly id: NodeId;
  readonly [key: string]: JsonValue;
}

/** Insert a new node (or replace an existing one wholesale). */
export interface NodePut {
  readonly op: "put";
  readonly node: SerializedNode;
}

/** Patch individual fields of an existing node. */
export interface NodePatch {
  readonly op: "patch";
  readonly fields: Readonly<Record<string, FieldOp>>;
}

/** Remove (tombstone) a node. */
export interface NodeRemove {
  readonly op: "remove";
}

/** A single node-level operation. */
export type NodeOp = NodePut | NodePatch | NodeRemove;

// ---------------------------------------------------------------------------
// Scene operations
// ---------------------------------------------------------------------------

export interface SceneAdd {
  readonly op: "add";
  readonly id: NodeId;
}

export interface SceneRemove {
  readonly op: "remove";
  readonly id: NodeId;
}

export interface SceneReorder {
  readonly op: "reorder";
  readonly ids: readonly NodeId[];
}

export type SceneOp = SceneAdd | SceneRemove | SceneReorder;

// ---------------------------------------------------------------------------
// Document diff
// ---------------------------------------------------------------------------

/**
 * A diff describing changes to a document.
 *
 * - `nodes` — per-node operations (insert, patch, or remove)
 * - `scenes` — ordered list of scene-level operations
 * - `metadata` — document-level metadata changes (keyed by metadata key)
 *
 * An empty diff (all fields undefined or empty) is a no-op.
 */
export interface DocumentDiff {
  readonly nodes?: Readonly<Record<NodeId, NodeOp>>;
  readonly scenes?: readonly SceneOp[];
  readonly metadata?: Readonly<Record<string, FieldOp>>;
}

// ---------------------------------------------------------------------------
// Presence (ephemeral, not persisted)
// ---------------------------------------------------------------------------

export interface CursorPresence {
  readonly cursor_id: string;
  readonly x: number;
  readonly y: number;
  /** Epoch ms — used for tie-breaking when multiple entries share a cursor_id. */
  readonly t: number;
}

export interface PresenceState {
  readonly cursor?: CursorPresence;
  readonly selection?: readonly NodeId[];
  readonly scene_id?: string;
  readonly viewport?: {
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
  };
  /** Palette / display name for the cursor badge. */
  readonly profile?: {
    readonly name?: string;
    readonly color?: string;
  };
}

// ---------------------------------------------------------------------------
// Wire messages: Client → Server
// ---------------------------------------------------------------------------

export interface ConnectMessage {
  readonly type: "connect";
  /** Schema version string (e.g. "0.91.0-beta+20260311"). */
  readonly schema: string;
  /** Last known server clock. 0 for a fresh connection. */
  readonly lastClock: number;
}

export interface PushMessage {
  readonly type: "push";
  /** Client-assigned sequence number for this push (monotonically increasing). */
  readonly clientClock: number;
  readonly diff: DocumentDiff;
  readonly presence?: PresenceState;
}

export interface PingMessage {
  readonly type: "ping";
}

export interface PresenceUpdateMessage {
  readonly type: "presence_update";
  readonly presence: PresenceState;
}

export type ClientMessage =
  | ConnectMessage
  | PushMessage
  | PingMessage
  | PresenceUpdateMessage;

// ---------------------------------------------------------------------------
// Wire messages: Server → Client
// ---------------------------------------------------------------------------

export type PushResult = "commit" | "discard" | "rebase";

export interface ConnectOkMessage {
  readonly type: "connect_ok";
  /** Current server clock. */
  readonly clock: number;
  /** If the client is behind, this contains the catch-up diff. */
  readonly diff?: DocumentDiff;
  /**
   * Full document state. Sent when the client's lastClock is too stale
   * for an incremental diff (or on first connect with lastClock=0).
   */
  readonly state?: Readonly<Record<NodeId, SerializedNode>>;
  /** Scene ref ordering. */
  readonly scenes?: readonly NodeId[];
}

export interface PushOkMessage {
  readonly type: "push_ok";
  readonly serverClock: number;
  /** The client clock this is acknowledging. */
  readonly clientClock: number;
  readonly result: PushResult;
  /**
   * When result is "rebase", this contains the server's version of the diff
   * (which may differ from what the client sent).
   */
  readonly diff?: DocumentDiff;
}

export interface PatchMessage {
  readonly type: "patch";
  readonly serverClock: number;
  readonly diff: DocumentDiff;
}

export interface PresenceBroadcastMessage {
  readonly type: "presence";
  readonly peers: Readonly<Record<string, PresenceState>>;
}

export interface PongMessage {
  readonly type: "pong";
}

export interface ErrorMessage {
  readonly type: "error";
  readonly code: string;
  readonly message: string;
}

export type ServerMessage =
  | ConnectOkMessage
  | PushOkMessage
  | PatchMessage
  | PresenceBroadcastMessage
  | PongMessage
  | ErrorMessage;
