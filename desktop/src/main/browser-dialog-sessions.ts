/** GRIDA-SEC-016 — bounded isolated sessions for native browser forms. */
import { session, type Session } from "electron";

/** Electron retains partition contexts until exit, so partition names are slots. */
export class BrowserDialogSessions {
  static readonly #slots = new Map<
    string,
    { session: Session; post?: { url: string; isLive(): boolean } }
  >();
  static readonly #limits = { auth: 8, find: 64 };
  static readonly #used = {
    auth: new Set<number>(),
    find: new Set<number>(),
  };

  static acquire(kind: "auth" | "find"): {
    session: Session;
    answerPost(url: string, isLive: () => boolean): void;
    release(): void;
  } | null {
    const used = this.#used[kind];
    let slot = 0;
    while (used.has(slot) && slot < this.#limits[kind]) slot++;
    if (slot === this.#limits[kind]) return null;
    used.add(slot);
    const partition = `grida-browser-dialog-${kind}-${slot}`;
    let context = this.#slots.get(partition);
    if (!context) {
      context = {
        session: session.fromPartition(partition, { cache: false }),
      };
      const retained = context;
      retained.session.setPermissionRequestHandler(
        (_contents, _permission, done) => done(false)
      );
      retained.session.setPermissionCheckHandler(() => false);
      // Never unregister this handler: even a retiring request cannot fall back to DNS.
      retained.session.protocol.handle(
        "https",
        (request) =>
          new Response(null, {
            status:
              retained.post?.isLive() &&
              request.method === "POST" &&
              request.url === retained.post.url
                ? 204
                : 403,
            headers: { "cache-control": "no-store" },
          })
      );
      this.#slots.set(partition, retained);
    }
    const retained = context;
    const isolated = retained.session;
    const block = () =>
      isolated.webRequest.onBeforeRequest(
        { urls: ["<all_urls>"] },
        (_details, done) => done({ cancel: true })
      );
    block();
    let released = false;
    return {
      session: isolated,
      answerPost(url, isLive) {
        if (!released) retained.post = { url, isLive };
      },
      release() {
        if (released) return;
        released = true;
        retained.post = undefined;
        // Replace closures before cleanup, and never reuse a slot whose cleanup failed.
        block();
        void isolated.clearStorageData().then(
          () => used.delete(slot),
          () => {}
        );
      },
    };
  }
}
