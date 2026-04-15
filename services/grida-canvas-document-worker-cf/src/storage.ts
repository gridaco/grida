/**
 * @module storage
 *
 * SQLite storage adapter for the SyncRoom Durable Object.
 *
 * Uses the DO's embedded SQLite database (`state.storage.sql`) for persistence.
 * Three tables:
 *   - `records`    — current node state (node_id → serialized JSON, clock)
 *   - `tombstones` — deleted node IDs (for reconnecting clients to detect deletes)
 *   - `meta`       — key-value metadata (document clock, schema version, scenes)
 *
 * All writes happen synchronously via `sql.exec()` inside the DO's single-threaded model.
 * Multi-statement writes are wrapped in `transactionSync()` for atomicity.
 */

import type {
  NodeId,
  SerializedNode,
  DocumentDiff,
  NodeOp,
} from "@grida/canvas-sync";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoredDocument {
  nodes: Record<NodeId, SerializedNode>;
  scenes: NodeId[];
  clock: number;
}

// ---------------------------------------------------------------------------
// SyncStorage
// ---------------------------------------------------------------------------

export class SyncStorage {
  private readonly sql: SqlStorage;
  private readonly storage: DurableObjectStorage;

  constructor(storage: DurableObjectStorage) {
    this.storage = storage;
    this.sql = storage.sql;
    this._ensureSchema();
  }

  // -------------------------------------------------------------------------
  // Schema
  // -------------------------------------------------------------------------

  private _ensureSchema(): void {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS records (
        node_id TEXT PRIMARY KEY,
        data    TEXT NOT NULL,
        clock   INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS tombstones (
        node_id TEXT PRIMARY KEY,
        clock   INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  // -------------------------------------------------------------------------
  // Full state load (on DO startup / hibernation wake)
  // -------------------------------------------------------------------------

  /** Load the entire document state from SQLite. */
  getFullState(): StoredDocument {
    const nodes: Record<NodeId, SerializedNode> = {};

    const rows = this.sql.exec("SELECT node_id, data FROM records").toArray();
    for (const row of rows) {
      const id = row.node_id as string;
      nodes[id] = JSON.parse(row.data as string) as SerializedNode;
    }

    const clock = this._getMetaInt("clock", 0);
    const scenes = this._getMetaJson<NodeId[]>("scenes", []);

    return { nodes, scenes, clock };
  }

  // -------------------------------------------------------------------------
  // Diff application
  // -------------------------------------------------------------------------

  /**
   * Apply a diff and persist to SQLite atomically.
   * Wrapped in a synchronous transaction to prevent partial writes on crash.
   */
  applyDiff(diff: DocumentDiff, clock: number): void {
    this.storage.transactionSync(() => {
      // Apply node operations
      if (diff.nodes) {
        for (const [id, op] of Object.entries(diff.nodes)) {
          this._applyNodeOp(id, op, clock);
        }
      }

      // Apply scene operations
      if (diff.scenes) {
        let scenes = this._getMetaJson<NodeId[]>("scenes", []);
        for (const sceneOp of diff.scenes) {
          switch (sceneOp.op) {
            case "add":
              if (!scenes.includes(sceneOp.id)) {
                scenes.push(sceneOp.id);
              }
              break;
            case "remove":
              scenes = scenes.filter((id) => id !== sceneOp.id);
              break;
            case "reorder":
              scenes = [...sceneOp.ids];
              break;
          }
        }
        this._setMetaJson("scenes", scenes);
      }

      // Update clock
      this._setMetaInt("clock", clock);

      // Prune tombstones if too many, recording the floor clock
      this._pruneTombstones(5000);
    });
  }

  private _applyNodeOp(id: NodeId, op: NodeOp, clock: number): void {
    switch (op.op) {
      case "put": {
        const data = JSON.stringify(op.node);
        this.sql.exec(
          "INSERT OR REPLACE INTO records (node_id, data, clock) VALUES (?, ?, ?)",
          id,
          data,
          clock
        );
        // Remove from tombstones if it was previously deleted
        this.sql.exec("DELETE FROM tombstones WHERE node_id = ?", id);
        break;
      }
      case "patch": {
        // Read current, apply patches, write back
        const row = this.sql
          .exec("SELECT data FROM records WHERE node_id = ?", id)
          .toArray();
        if (row.length === 0) break; // Skip if node doesn't exist
        const node = JSON.parse(row[0].data as string) as Record<
          string,
          unknown
        >;
        for (const [key, fieldOp] of Object.entries(op.fields)) {
          switch (fieldOp.op) {
            case "put":
              node[key] = fieldOp.value;
              break;
            case "delete":
              delete node[key];
              break;
          }
        }
        this.sql.exec(
          "UPDATE records SET data = ?, clock = ? WHERE node_id = ?",
          JSON.stringify(node),
          clock,
          id
        );
        break;
      }
      case "remove": {
        this.sql.exec("DELETE FROM records WHERE node_id = ?", id);
        this.sql.exec(
          "INSERT OR REPLACE INTO tombstones (node_id, clock) VALUES (?, ?)",
          id,
          clock
        );
        break;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Delta queries (for reconnecting clients)
  // -------------------------------------------------------------------------

  /**
   * Get all changes since a given clock.
   * Returns a diff containing:
   *   - Nodes that were added or modified since `sinceClock`
   *   - Nodes that were deleted since `sinceClock` (as remove ops)
   *
   * Returns null if the clock is current (no changes).
   *
   * Note: scene ordering is NOT included in the delta — the caller
   * (SyncRoom._handleConnect) sends `scenes` separately as a full snapshot
   * alongside the diff. This is intentional: scene ordering is small enough
   * that a full snapshot is simpler and more reliable than tracking incremental
   * scene ops in the delta.
   */
  getDelta(sinceClock: number): DocumentDiff | null {
    const currentClock = this._getMetaInt("clock", 0);
    if (sinceClock >= currentClock) return null;

    // If the requested clock is older than the oldest retained tombstone,
    // we can't guarantee a complete delta — return null to force full state.
    const tombstoneFloor = this._getMetaInt("tombstone_floor", 0);
    if (sinceClock < tombstoneFloor) return null;

    const nodeOps: Record<NodeId, NodeOp> = {};
    let hasOps = false;

    // Changed/added records
    const changed = this.sql
      .exec("SELECT node_id, data FROM records WHERE clock > ?", sinceClock)
      .toArray();
    for (const row of changed) {
      const id = row.node_id as string;
      const node = JSON.parse(row.data as string) as SerializedNode;
      nodeOps[id] = { op: "put", node };
      hasOps = true;
    }

    // Deleted records (tombstones)
    const deleted = this.sql
      .exec("SELECT node_id FROM tombstones WHERE clock > ?", sinceClock)
      .toArray();
    for (const row of deleted) {
      const id = row.node_id as string;
      nodeOps[id] = { op: "remove" };
      hasOps = true;
    }

    if (!hasOps) return null;
    return { nodes: nodeOps };
  }

  // -------------------------------------------------------------------------
  // Meta helpers
  // -------------------------------------------------------------------------

  private _getMetaInt(key: string, defaultValue: number): number {
    const rows = this.sql
      .exec("SELECT value FROM meta WHERE key = ?", key)
      .toArray();
    if (rows.length === 0) return defaultValue;
    return parseInt(rows[0].value as string, 10);
  }

  private _setMetaInt(key: string, value: number): void {
    this.sql.exec(
      "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
      key,
      value.toString()
    );
  }

  private _getMetaJson<T>(key: string, defaultValue: T): T {
    const rows = this.sql
      .exec("SELECT value FROM meta WHERE key = ?", key)
      .toArray();
    if (rows.length === 0) return defaultValue;
    try {
      return JSON.parse(rows[0].value as string) as T;
    } catch {
      return defaultValue;
    }
  }

  private _setMetaJson(key: string, value: unknown): void {
    this.sql.exec(
      "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
      key,
      JSON.stringify(value)
    );
  }

  // -------------------------------------------------------------------------
  // Tombstone pruning
  // -------------------------------------------------------------------------

  private _pruneTombstones(maxCount: number): void {
    const countRows = this.sql
      .exec("SELECT COUNT(*) as cnt FROM tombstones")
      .toArray();
    const count = (countRows[0]?.cnt as number) ?? 0;
    if (count <= maxCount) return;

    // Find the clock of the oldest tombstone that will survive pruning.
    // Any client with sinceClock < this value cannot get a reliable delta.
    const toDelete = count - maxCount;
    const floorRows = this.sql
      .exec(
        "SELECT clock FROM tombstones ORDER BY clock ASC LIMIT 1 OFFSET ?",
        toDelete
      )
      .toArray();
    if (floorRows.length > 0) {
      this._setMetaInt("tombstone_floor", floorRows[0].clock as number);
    }

    this.sql.exec(
      "DELETE FROM tombstones WHERE node_id IN (SELECT node_id FROM tombstones ORDER BY clock ASC LIMIT ?)",
      toDelete
    );
  }
}
