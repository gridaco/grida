/**
 * Agentic-chat session storage — drizzle schema.
 *
 * Three tables: `chat_sessions`, `chat_messages`, `chat_parts`. The
 * shape is agent-agnostic — Grida Copilot and future agents share the
 * same rows. Agent-specific data goes in `metadata_json` and the part
 * `data_json` blob; no agent-specific columns.
 *
 * JSON columns are stored as TEXT and (de)serialized in `store.ts`
 * rather than using drizzle's custom column types — keeps the schema
 * dialect-portable and the raw `sqlite3 sessions.db` view inspectable.
 */

import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * Current schema version, stamped into the DB's `PRAGMA user_version`.
 * `db.ts` gates on this at open time: an unstamped DB is treated as current
 * and stamped; a DB stamped HIGHER than this is forward-incompatible and the
 * open throws (an older binary must not silently write a newer DB). Bump this
 * alongside an entry in the ALTER-ladder in `db.ts` whenever the schema
 * changes in a way an in-place migration must handle.
 */
export const SCHEMA_VERSION = 1;

export const chatSessions = sqliteTable(
  "chat_sessions",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull().default("New Chat"),
    agent: text("agent").notNull(),
    workspace_id: text("workspace_id"),
    workspace_root: text("workspace_root"),
    model_json: text("model_json"),
    // Fork lineage (RFC `session / fork`). `parent_id` points at
    // the source session; `parent_message_id` at the forked-from message.
    // Null for root sessions.
    parent_id: text("parent_id"),
    parent_message_id: text("parent_message_id"),
    // Session-scoped permission rules (RFC `persistency / permission rule
    // shape`). JSON array; `'[]'` when none.
    permissions_json: text("permissions_json").notNull().default("[]"),
    metadata_json: text("metadata_json").notNull().default("{}"),
    prompt_tokens: integer("prompt_tokens").notNull().default(0),
    completion_tokens: integer("completion_tokens").notNull().default(0),
    // RFC `session / context-window-tracking` breaks usage into five
    // buckets; `total_tokens` is their sum (== context_window_used).
    reasoning_tokens: integer("reasoning_tokens").notNull().default(0),
    cache_read: integer("cache_read").notNull().default(0),
    cache_write: integer("cache_write").notNull().default(0),
    total_tokens: integer("total_tokens").notNull().default(0),
    cost_usd: real("cost_usd").notNull().default(0),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
    archived_at: integer("archived_at"),
  },
  (t) => [
    index("idx_chat_sessions_agent_updated").on(t.agent, t.updated_at),
    index("idx_chat_sessions_workspace_updated").on(
      t.workspace_id,
      t.updated_at
    ),
    index("idx_chat_sessions_parent").on(t.parent_id),
    index("idx_chat_sessions_archived").on(t.archived_at),
  ]
);

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    session_id: text("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    metadata_json: text("metadata_json").notNull().default("{}"),
    // Rewind truncation pointer (RFC `session / rewinding`). Epoch ms when
    // a REWIND hid this message; null when visible. Compaction does NOT set
    // this — its summarized head stays visible and the model boundary is
    // resolved at read-time from the marker's `tail_start_id` (see
    // `session/boundary.ts`). The row always stays in the DB.
    hidden_at: integer("hidden_at"),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (t) => [
    index("idx_chat_messages_session_created").on(t.session_id, t.created_at),
    index("idx_chat_messages_hidden").on(t.hidden_at),
  ]
);

export const chatParts = sqliteTable(
  "chat_parts",
  {
    id: text("id").primaryKey(),
    message_id: text("message_id")
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    session_id: text("session_id").notNull(),
    index: integer("index").notNull(),
    type: text("type").notNull(),
    data_json: text("data_json").notNull(),
    tool_call_id: text("tool_call_id"),
    tool_state: text("tool_state"),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (t) => [
    // UNIQUE so two racing writers can't INSERT duplicate rows for the same
    // (message_id, index) — the upsert in `store.ts` relies on this constraint
    // for its `ON CONFLICT(message_id, "index") DO UPDATE` index-keyed leg.
    uniqueIndex("idx_chat_parts_message_index").on(t.message_id, t.index),
    index("idx_chat_parts_session").on(t.session_id),
    index("idx_chat_parts_tool_call").on(t.tool_call_id),
  ]
);

/**
 * Idempotent schema bootstrap. Applied on `openSessionsDb()` via
 * {@link BOOTSTRAP_SQL}: a single `CREATE ... IF NOT EXISTS` pass, no
 * drizzle-kit migrations. The DB is per-user local with no shipped
 * version to evolve from — when it graduates to real users + breaking
 * changes, replace this with versioned migrations.
 *
 * Split into tables-then-indexes purely for readability; both run in one
 * shot (indexes can't reference a not-yet-created table).
 */
const BOOTSTRAP_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'New Chat',
    agent TEXT NOT NULL,
    workspace_id TEXT,
    workspace_root TEXT,
    model_json TEXT,
    parent_id TEXT,
    parent_message_id TEXT,
    permissions_json TEXT NOT NULL DEFAULT '[]',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    reasoning_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read INTEGER NOT NULL DEFAULT 0,
    cache_write INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    archived_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    hidden_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chat_parts (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    type TEXT NOT NULL,
    data_json TEXT NOT NULL,
    tool_call_id TEXT,
    tool_state TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`;

/** Index creation. */
const BOOTSTRAP_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_chat_sessions_agent_updated
    ON chat_sessions(agent, updated_at);
  CREATE INDEX IF NOT EXISTS idx_chat_sessions_workspace_updated
    ON chat_sessions(workspace_id, updated_at);
  CREATE INDEX IF NOT EXISTS idx_chat_sessions_parent
    ON chat_sessions(parent_id);
  CREATE INDEX IF NOT EXISTS idx_chat_sessions_archived
    ON chat_sessions(archived_at);

  CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created
    ON chat_messages(session_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_chat_messages_hidden
    ON chat_messages(hidden_at);

  CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_parts_message_index
    ON chat_parts(message_id, "index");
  CREATE INDEX IF NOT EXISTS idx_chat_parts_session
    ON chat_parts(session_id);
  CREATE INDEX IF NOT EXISTS idx_chat_parts_tool_call
    ON chat_parts(tool_call_id);
`;

/** Schema bootstrap: tables + indexes, idempotent (`CREATE ... IF NOT EXISTS`). */
export const BOOTSTRAP_SQL = BOOTSTRAP_TABLES_SQL + BOOTSTRAP_INDEXES_SQL;
