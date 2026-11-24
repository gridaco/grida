import type {
  DesktopNativeChat,
  NativeChatCatalogEntry,
  NativeChatPage,
  NativeChatSideSnapshot,
  WorkspaceFsEntry,
} from "@grida/desktop-bridge";
import { DesktopChatFixture } from "../composer/desktop-chat-fixture";
import { DesktopSubagentFixture } from "../composer/desktop-subagent-fixture";

type Session = {
  fixture: DesktopChatFixture;
  entry: NativeChatCatalogEntry;
  side?: NativeChatSideSnapshot;
};

const exampleDirectory: Readonly<Record<string, readonly WorkspaceFsEntry[]>> =
  {
    "": [
      { name: "README.md", rel_path: "README.md", kind: "file" },
      { name: "handout.md", rel_path: "handout.md", kind: "file" },
      { name: "assets", rel_path: "assets", kind: "directory" },
    ],
    assets: [{ name: "cover.png", rel_path: "assets/cover.png", kind: "file" }],
  };

const sideUnavailable = [
  "catalog",
  "compaction",
  "delegation",
  "fork",
  "goals",
  "side_chat",
  "subagents",
  "wakeups",
] satisfies NativeChatSideSnapshot["unavailable"];

/** Multiplexes local chat fixtures over the same bridge used by a workspace. */
export class NativeChatWorkspaceFixture {
  private readonly sessions = new Map<string, Session>();
  private readonly drafts = new Map<string, Session>();
  private readonly forks = new Map<string, string>();
  private readonly subscriptions = new Map<string, Session>();
  private readonly listeners = new Set<() => void>();
  private readonly catalogListeners = new Set<() => void>();
  private active: Session;
  readonly bridge: DesktopNativeChat;

  constructor(initial: DesktopChatFixture) {
    if (initial.scenario === "subagents")
      Object.assign(
        initial.bridge,
        DesktopSubagentFixture.forParent(initial.sessionId)
      );
    this.active = this.register(initial, "Gallery handout");
    // Scope attached methods to their own fixture, including late calls
    // from an earlier attachment or from a side chat beside the main pane.
    this.bridge = new Proxy(this.workspaceBridge, {
      get: (workspace, key: keyof DesktopNativeChat) => {
        if (key in workspace) return workspace[key];
        const member = this.active.fixture.bridge[key];
        if (typeof member !== "function") return member;
        return (...args: unknown[]) => {
          const first = args[0];
          const session =
            typeof first === "string" ? this.sessions.get(first) : this.active;
          if (!session) {
            if (key.startsWith("on")) return () => {};
            return Promise.reject(new Error("fixture_session_unavailable"));
          }
          const bridge = session.fixture.bridge;
          const method = bridge[key];
          if (typeof method !== "function")
            throw new Error("fixture_capability_unavailable");
          return Reflect.apply(method, bridge, args);
        };
      },
    }) as DesktopNativeChat;
  }

  readonly readdir = async (directory: string) =>
    Object.hasOwn(exampleDirectory, directory)
      ? exampleDirectory[directory]
      : [];

  readonly read = () => this.active.fixture;

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  resetRequests() {
    for (const { fixture } of this.sessions.values()) fixture.resetRequests();
  }

  private register(
    fixture: DesktopChatFixture,
    title: string,
    side?: NativeChatSideSnapshot
  ): Session {
    const sessionId = fixture.sessionId;
    const session = {
      fixture,
      entry: { sessionId, revision: 0, title, archived: false },
      side,
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  private createSession(title = "New chat", side?: NativeChatSideSnapshot) {
    const previous = this.active.fixture;
    const fixture = new DesktopChatFixture("empty", false, {
      settings: previous.settings,
    });
    if (!side) {
      // The demo controls apply to the draft even before it has a chat ID.
      fixture.submission.hold(previous.submission.read().hold);
      fixture.setReplyHeld(previous.readReplyHeld());
    }
    return this.register(fixture, title, side);
  }

  private session(id: string): Session {
    const session = this.sessions.get(id);
    if (!session) throw new Error("fixture_session_unavailable");
    return session;
  }

  private activate(session: Session) {
    this.active = session;
    for (const listener of this.listeners) listener();
  }

  private publishCatalog() {
    for (const listener of this.catalogListeners) listener();
  }

  private list(archived: boolean): NativeChatPage {
    const entries = Array.from(this.sessions.values()).filter(
      ({ side, entry }) => !side && entry.archived === archived
    );
    return {
      sessionIds: entries.map(({ entry }) => entry.sessionId),
      titles: entries.map(({ entry }) => ({
        sessionId: entry.sessionId,
        title: entry.title ?? "New chat",
      })),
      runningSessionIds: entries
        .filter(({ fixture }) => fixture.readRunning())
        .map(({ entry }) => entry.sessionId),
      nextCursor: null,
    };
  }

  private readonly workspaceBridge: Partial<DesktopNativeChat> = {
    list: async () => this.list(false),
    listArchived: async () => this.list(true),
    observeCatalog: async (listener) => {
      this.catalogListeners.add(listener);
      return () => this.catalogListeners.delete(listener);
    },
    catalogEntry: async (id) => this.session(id).entry,
    organize: async (id, change) => {
      const session = this.session(id);
      if (change.revision !== session.entry.revision)
        throw new Error("catalog_revision_changed");
      session.entry = {
        ...session.entry,
        title: change.title,
        archived: change.archived,
        revision: change.revision + 1,
      };
      this.publishCatalog();
      return session.entry;
    },
    create: async () => {
      const session = this.createSession();
      this.activate(session);
      this.publishCatalog();
      return session.fixture.bridge.create();
    },
    createFromDraft: async (draftId, manualApproval) => {
      let session = this.drafts.get(draftId);
      if (!session) {
        session = this.createSession();
        this.drafts.set(draftId, session);
        this.publishCatalog();
      }
      this.activate(session);
      return session.fixture.bridge.createFromDraft!(draftId, manualApproval);
    },
    load: async (id) => {
      const session = this.session(id);
      if (session.side) throw new Error("fixture_session_unavailable");
      this.activate(session);
      return session.fixture.bridge.load(id);
    },
    skills: async () => this.active.fixture.bridge.skills!(),
    submitInRegime: async (action, id, ...args) =>
      this.session(id).fixture.bridge.submitInRegime!(action, id, ...args),
    queueCheckout: {
      checkout: async (id, request) =>
        this.session(id).fixture.bridge.queueCheckout!.checkout(id, request),
      reinsert: async (id, request) =>
        this.session(id).fixture.bridge.queueCheckout!.reinsert(id, request),
      read: async (id, checkoutId, inputId) =>
        this.session(id).fixture.bridge.queueCheckout!.read!(
          id,
          checkoutId,
          inputId
        ),
      receipt: async (id, requestId) =>
        this.session(id).fixture.bridge.queueCheckout!.receipt!(id, requestId),
      readAttachmentPreview: async (id, checkoutId, previewId) =>
        this.session(id).fixture.bridge.queueCheckout!.readAttachmentPreview!(
          id,
          checkoutId,
          previewId
        ),
    },
    commands: async (id) => {
      const { side, fixture } = this.session(id);
      return side ? [] : [...(await fixture.bridge.commands!(id)), "fork"];
    },
    runCommand: async (id, command, requestId) => {
      const source = this.session(id);
      if (command === "compact")
        return source.fixture.bridge.runCommand!(id, command, requestId);
      if (source.side) throw new Error("fixture_capability_unavailable");
      const key = JSON.stringify([id, requestId]);
      let sessionId = this.forks.get(key);
      if (!sessionId) {
        const fork = this.createSession(
          `${source.entry.title ?? "Chat"} (fork)`
        );
        fork.fixture.seedHistoryFrom(source.fixture);
        sessionId = fork.entry.sessionId;
        this.forks.set(key, sessionId);
        this.publishCatalog();
      }
      return { command, sessionId };
    },
    transcriptPage: async (id, before) => {
      const { fixture } = this.session(id);
      const page = await fixture.bridge.transcriptPage!(id);
      if (fixture.scenario !== "time-dividers" || !page.turns) return page;
      const end = before
        ? page.turns.findIndex(({ turnId }) => turnId === before)
        : page.turns.length;
      if (end < 0) throw new Error("history_cursor_unavailable");
      const start = Math.max(0, end - 2);
      const turns = page.turns.slice(start, end);
      const turnIds = new Set(turns.map(({ turnId }) => turnId));
      return {
        ...page,
        turns,
        messages: page.messages.filter(
          ({ turnId }) => turnId && turnIds.has(turnId)
        ),
        older: start > 0 ? turns[0].turnId : null,
      };
    },
    openSideChat: async (parentSessionId) => {
      const parent = this.session(parentSessionId);
      if (parent.side) throw new Error("fixture_side_chat_unavailable");
      const { fixture } = this.createSession("Side chat", {
        parentSessionId,
        temporary: true,
        unavailable: sideUnavailable,
        title: "Side chat",
      });
      return {
        ...(await fixture.bridge.create()),
        parentSessionId,
        compacted: false,
        omitted: false,
      };
    },
    closeSideChat: async (id) => {
      const session = this.session(id);
      if (!session.side) throw new Error("fixture_side_chat_unavailable");
      session.fixture.resetRequests();
      this.sessions.delete(id);
    },
    observe: async (id) => {
      const { fixture, side } = this.session(id);
      const observation = await fixture.bridge.observe(id);
      return side
        ? {
            ...observation,
            snapshot: { ...observation.snapshot, side },
          }
        : observation;
    },
    subscribe: async (id, ...args) => {
      const session = this.session(id);
      const subscription = await session.fixture.bridge.subscribe(id, ...args);
      this.subscriptions.set(subscription, session);
      return subscription;
    },
    unsubscribe: async (id) => {
      const session = this.subscriptions.get(id);
      this.subscriptions.delete(id);
      await session?.fixture.bridge.unsubscribe(id);
    },
    detach: async (id) => {
      await this.sessions.get(id)?.fixture.bridge.detach(id);
    },
  };
}
