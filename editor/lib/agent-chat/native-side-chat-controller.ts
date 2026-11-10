import type {
  DesktopNativeChat,
  NativeChatSideAnswer,
  NativeChatSideContext,
} from "@grida/desktop-bridge";

type SideBridge = Required<
  Pick<DesktopNativeChat, "openSideChat" | "askSideChat" | "closeSideChat">
>;
type SideExchange = Readonly<{
  question: string;
  answer: NativeChatSideAnswer;
}>;
type View = Readonly<{
  phase: "opening" | "ready" | "unavailable" | "closing";
  context: NativeChatSideContext | null;
  exchanges: readonly SideExchange[];
  draft: string;
  asking: boolean;
  error: string | null;
}>;

const QUESTION_LIMIT = 16 * 1024;
const QUOTE_LIMIT = 16 * 1024;
const utf8 = new TextEncoder();

/** A temporary renderer view bound to one admitted parent attachment. */
export class NativeSideChatController {
  private readonly openId = crypto.randomUUID();
  private readonly listeners = new Set<() => void>();
  private opening?: Promise<void>;
  private closing?: Promise<void>;
  private pending?: Readonly<{ requestId: string; text: string }>;
  private view: View = {
    phase: "opening",
    context: null,
    exchanges: [],
    draft: "",
    asking: false,
    error: null,
  };

  constructor(
    private readonly bridge: SideBridge,
    private readonly parent: string
  ) {}

  static supported(
    bridge: DesktopNativeChat
  ): bridge is DesktopNativeChat & SideBridge {
    return (
      !!bridge.openSideChat && !!bridge.askSideChat && !!bridge.closeSideChat
    );
  }

  readonly read = () => this.view;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  open(): Promise<void> {
    if (this.opening) return this.opening;
    if (this.closing || this.view.phase === "ready") return Promise.resolve();
    this.update({ phase: "opening", error: null });
    this.opening = this.bridge
      .openSideChat(this.parent, this.openId)
      .then((context) => {
        if (!this.closing) this.update({ phase: "ready", context });
      })
      .catch(() => {
        if (!this.closing)
          this.update({
            phase: "unavailable",
            error: "Couldn't open the side chat.",
          });
      })
      .finally(() => {
        this.opening = undefined;
      });
    return this.opening;
  }

  setDraft(draft: string): void {
    if (this.view.phase === "ready" && !this.view.asking)
      this.update({ draft });
  }

  quote(turnId: string): string | null {
    if (this.view.phase !== "ready") return null;
    const answer = this.view.exchanges.find(
      ({ answer }) => answer.turnId === turnId
    )?.answer;
    if (answer?.status !== "succeeded" || !answer.text.trim()) return null;
    const quoted = answer.text.replace(/\r\n?/g, "\n").replace(/^/gm, "> ");
    const bytes = new Uint8Array(QUOTE_LIMIT);
    const { read, written } = utf8.encodeInto(quoted, bytes);
    const excerpt = answer.textTruncated || read < quoted.length;
    return `Side chat answer${excerpt ? " (excerpt)" : ""}\n${new TextDecoder().decode(
      bytes.subarray(0, written)
    )}`;
  }

  async ask(): Promise<void> {
    if (this.view.phase !== "ready" || this.view.asking) return;
    const text = this.view.draft;
    if (!text.trim() || utf8.encode(text).length > QUESTION_LIMIT) {
      this.update({ error: "Enter a question of at most 16 KiB." });
      return;
    }
    if (this.pending && this.pending.text !== text) {
      this.update({
        error: "Retry the original question or open a new side chat.",
      });
      return;
    }
    const pending = (this.pending ??= { text, requestId: crypto.randomUUID() });
    this.update({ asking: true, error: null });
    try {
      const answer = await this.bridge.askSideChat(
        this.parent,
        this.openId,
        pending.requestId,
        pending.text
      );
      if (this.closing) return;
      this.pending = undefined;
      this.update({
        exchanges: [...this.view.exchanges, { question: pending.text, answer }],
        draft: "",
      });
    } catch (error) {
      if (this.closing) return;
      const limited =
        error instanceof Error &&
        error.message.includes("side_chat_turn_limit");
      if (limited) this.pending = undefined;
      this.update({
        error: limited
          ? "This side chat reached its question limit."
          : "Couldn't confirm the answer. Your question is still here.",
      });
    } finally {
      if (!this.closing) this.update({ asking: false });
    }
  }

  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closing = Promise.resolve().then(() =>
      this.bridge.closeSideChat(this.parent, this.openId)
    );
    this.update({
      phase: "closing",
      context: null,
      exchanges: [],
      draft: "",
      asking: false,
      error: null,
    });
    return this.closing;
  }

  private update(change: Partial<View>): void {
    this.view = { ...this.view, ...change };
    for (const listener of this.listeners) listener();
  }
}
