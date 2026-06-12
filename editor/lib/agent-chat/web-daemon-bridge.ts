"use client";

/**
 * Web daemon bridge — a `DesktopBridge` implementation for a PLAIN BROWSER
 * page, backed by the local agent daemon over HTTP instead of the Electron
 * preload (issue #798; WG spec docs/wg/ai/agent/daemon.md §the-browser-
 * exception, path 2 — origin-bridged).
 *
 * The desktop preload and this module are two installers of the SAME
 * `window.grida` contract (`@grida/desktop-bridge`): the preload signs
 * requests with credentials delivered over guarded IPC; this one signs with
 * a credential the developer supplies explicitly (read from
 * `grida-agent serve --register` output). Everything above the bridge —
 * `@/lib/desktop/bridge`, `@/lib/agent-chat`, the chat scaffolds — runs
 * unmodified. The sole installer is
 * `scaffolds/desktop/web-daemon-dev-boot.tsx`, which boots the PROD
 * `/desktop/*` pages in development builds — there is no dedicated demo
 * page.
 *
 * The agent-facing namespaces (handshake / agent / sessions / secrets /
 * files / recent / workspaces) map 1:1 onto `AgentTransport.Client`,
 * mirroring `desktop/src/preload.ts`. The native-only namespaces (window /
 * dialog / shell / host_apps, `workspaces.trash_entry`) have no daemon
 * counterpart and degrade to honest web fallbacks; `caps.native` reports
 * them all `false` so gated UI stays hidden.
 *
 * GRIDA-SEC-004 — dev affordance, not a perimeter change. The daemon only
 * answers when it was started with this page's origin explicitly
 * allowlisted (`--allow-origin` / `--allow-referer-path`), and every
 * request still carries the Basic credential. The credential lives in this
 * module's closure; it is never placed on `window.grida`.
 */

import { AgentTransport } from "@grida/agent/transport";
import {
  DESKTOP_BRIDGE_PROTOCOL,
  type DesktopBridge,
} from "@grida/desktop-bridge";
import type {
  AgentRunOptions,
  AgentUIMessageChunk,
  CreateSessionOptions,
  PatchSessionOptions,
  SessionListFilter,
} from "@grida/agent";

export type WebDaemonBridgeOptions = {
  /** Daemon base URL, e.g. `http://127.0.0.1:53301`. */
  base_url: string;
  /** The daemon credential (`PASSWORD=` from `grida-agent serve`). */
  password: string;
};

export function createWebDaemonBridge(
  options: WebDaemonBridgeOptions
): DesktopBridge {
  // No `origin` / `referer` overrides: in a real browser both are
  // forbidden headers the browser sets itself — which is exactly what the
  // daemon's CORS + Referer guards check against its allowlist.
  const client = new AgentTransport.Client({
    base_url: options.base_url,
    password: options.password,
  });

  // In-flight run registry: session id → AbortController, so
  // `agent.abort` can also tear down the local stream read.
  const agentRuns = new Map<string, AbortController>();
  // Status subscriptions: subscription id → AbortController.
  const statusSubs = new Map<string, AbortController>();

  type AgentOpenSpec =
    | { kind: "run"; opts: AgentRunOptions }
    | { kind: "reconnect"; session_id: string; last_event_id: number };

  async function openAgentStream(
    spec: AgentOpenSpec,
    onChunk: (chunk: AgentUIMessageChunk) => void
  ): Promise<{
    stream_id: string;
    session_id: string;
    done: Promise<void>;
  } | null> {
    const placeholderKey =
      spec.kind === "reconnect" ? spec.session_id : crypto.randomUUID();
    const controller = new AbortController();
    agentRuns.set(placeholderKey, controller);

    let handle: AgentTransport.AgentStreamHandle | null;
    try {
      handle =
        spec.kind === "run"
          ? await client.agent.run(spec.opts, onChunk, {
              signal: controller.signal,
            })
          : await client.agent.reconnect(
              spec.session_id,
              spec.last_event_id,
              onChunk,
              { signal: controller.signal }
            );
    } catch (err) {
      agentRuns.delete(placeholderKey);
      throw err;
    }

    if (handle === null) {
      agentRuns.delete(placeholderKey);
      return null;
    }

    // Promote the registry key from the placeholder to the real session id
    // once the server echoes it (mirrors the preload).
    const sessionId =
      spec.kind === "reconnect" ? spec.session_id : handle.session_id;
    let runKey = placeholderKey;
    if (sessionId && sessionId !== placeholderKey) {
      agentRuns.delete(placeholderKey);
      agentRuns.set(sessionId, controller);
      runKey = sessionId;
    }

    const done = handle.done.finally(() => {
      agentRuns.delete(runKey);
    });

    return { stream_id: runKey, session_id: sessionId, done };
  }

  const unavailable = (capability: string) =>
    Promise.reject(
      new Error(`[web-daemon-bridge] ${capability} is desktop-only`)
    );

  return {
    protocol: DESKTOP_BRIDGE_PROTOCOL,
    app: { version: "web-daemon-dev", platform: "web" },
    caps: {
      native: {
        host_apps: false,
        window: false,
        dialog: false,
        shell: false,
        terminal: false,
      },
    },
    handshake: () => client.handshake(),

    window: {
      set_document_edited: async () => {},
      set_represented_filename: async () => {},
      close: async () => {},
      navigation: {
        state: async () => ({ can_go_back: false, can_go_forward: false }),
        subscribe: () => () => {},
        back: async () => {},
        forward: async () => {},
      },
    },
    dialog: {
      // The native confirm maps onto window.confirm: OK → default button,
      // cancel → cancel button (fall back to "last button" like Electron).
      confirm: async (opts) => {
        const ok = window.confirm(
          opts.detail ? `${opts.message}\n\n${opts.detail}` : opts.message
        );
        if (ok) return opts.default_id ?? 0;
        return opts.cancel_id ?? Math.max(opts.buttons.length - 1, 0);
      },
      open: async () => null,
      save_as: async () => null,
    },
    shell: {
      open_external: async (url) => {
        window.open(url, "_blank", "noopener,noreferrer");
      },
      show_item_in_folder: () => unavailable("shell.show_item_in_folder"),
      get_path_for_file: () => "",
    },

    files: {
      read: (docId) => client.files.read(docId),
      write: (docId, content) => client.files.write(docId, content),
    },
    recent: {
      list: () => client.recent.list(),
      touch: (path) => client.recent.touch(path),
      pin: (path, pinned) => client.recent.pin(path, pinned),
      forget: (path) => client.recent.forget(path),
    },
    workspaces: {
      list: () => client.workspaces.list(),
      open: (rootPath) => client.workspaces.open(rootPath),
      pin: (id, pinned) => client.workspaces.pin(id, pinned),
      forget: (id) => client.workspaces.forget(id),
      readdir: (workspaceId, relPath) =>
        client.workspaces.readdir(workspaceId, relPath),
      read_file: (workspaceId, relPath) =>
        client.workspaces.read_file(workspaceId, relPath),
      read_file_bytes: (workspaceId, relPath) =>
        client.workspaces.read_file_bytes(workspaceId, relPath),
      write_file: (workspaceId, relPath, content) =>
        client.workspaces.write_file(workspaceId, relPath, content),
      trash_entry: () => unavailable("workspaces.trash_entry"),
    },
    terminal: {
      // PTY host is an Electron-main capability; the web daemon bridge
      // reports `caps.native.terminal: false` and the UI hides the pane.
      create: () => unavailable("terminal.create"),
      write: () => unavailable("terminal.write"),
      resize: () => unavailable("terminal.resize"),
      kill: () => unavailable("terminal.kill"),
    },
    host_apps: {
      resolve_preferred: async () => [],
      open_workspace: () => unavailable("host_apps.open_workspace"),
    },
    secrets: {
      has: (providerId) => client.secrets.has(providerId),
      set: (providerId, key) => client.secrets.set(providerId, key),
      delete: (providerId) => client.secrets.delete(providerId),
    },
    providers: {
      list_endpoints: () => client.providers.list_endpoints(),
      set_endpoint: (config) => client.providers.set_endpoint(config),
      delete_endpoint: (id) => client.providers.delete_endpoint(id),
    },

    agent: {
      run: (opts, onChunk) =>
        // Fresh runs always return a stream (only `reconnect` may return
        // null on 404); cast to the non-nullable shape the contract expects.
        openAgentStream({ kind: "run", opts }, onChunk) as Promise<{
          stream_id: string;
          session_id: string;
          done: Promise<void>;
        }>,
      abort: async (sessionId) => {
        await client.agent.abort(sessionId);
        const controller = agentRuns.get(sessionId);
        if (controller) {
          agentRuns.delete(sessionId);
          controller.abort();
        }
      },
      reconnect: (sessionId, lastEventId, onChunk) =>
        openAgentStream(
          {
            kind: "reconnect",
            session_id: sessionId,
            last_event_id: lastEventId,
          },
          onChunk
        ),
    },

    sessions: {
      list: (filter?: SessionListFilter) => client.sessions.list(filter),
      get: (id: string) => client.sessions.get(id),
      create: (opts: CreateSessionOptions) => client.sessions.create(opts),
      patch: (id: string, opts: PatchSessionOptions) =>
        client.sessions.patch(id, opts),
      delete: (id: string) => client.sessions.delete(id),
      list_messages: (id: string) => client.sessions.list_messages(id),
      rewind: (id, fromMessageId, opts) =>
        client.sessions.rewind(id, fromMessageId, opts),
      fork: (id, fromMessageId, metadata) =>
        client.sessions.fork(id, fromMessageId, metadata),
      compact: (id) => client.sessions.compact(id),
      enqueue: (id, message) => client.sessions.enqueue(id, message),
      list_queued: (id) => client.sessions.list_queued(id),
      cancel_queued: (id, messageId) =>
        client.sessions.cancel_queued(id, messageId),
      subscribe_status: async (id, onStatus) => {
        const subscriptionId = crypto.randomUUID();
        const controller = new AbortController();
        statusSubs.set(subscriptionId, controller);
        let done: Promise<void>;
        try {
          ({ done } = await client.sessions.subscribe_status(id, onStatus, {
            signal: controller.signal,
          }));
        } catch (err) {
          // A failed attach returns no subscription_id, so the caller can
          // never unsubscribe — drop the registry entry here instead.
          statusSubs.delete(subscriptionId);
          throw err;
        }
        return {
          subscription_id: subscriptionId,
          done: done.finally(() => {
            statusSubs.delete(subscriptionId);
          }),
        };
      },
      unsubscribe_status: async (subscriptionId) => {
        const controller = statusSubs.get(subscriptionId);
        if (controller) {
          statusSubs.delete(subscriptionId);
          controller.abort();
        }
      },
    },
  };
}
