import type {
  NativeChatMessageAttachment,
  NativeChatQueueAction,
  NativeChatQueueItem,
  NativeChatQueuePage,
} from "@grida/desktop-bridge";
import type { NativeComposerQueue } from "@/scaffolds/desktop/workbench/native-composer-tray";
import { DesktopComposerFixtures as fixtures } from "./desktop-fixtures";

/** Local queue state for the production rows; never connects to a running agent. */
export class DesktopQueueFixture implements NativeComposerQueue.Controller {
  private items = fixtures.queue;
  private draft: NativeComposerQueue.View["queueDraft"] = null;
  private running = true;
  private steered: readonly string[] = [];
  private readonly listeners = new Set<() => void>();
  private snapshot = this.project();

  constructor(
    private readonly capabilities: Readonly<{ replaceText: boolean }> = {
      replaceText: true,
    }
  ) {}

  readonly queueCurrent = true;
  get canSteer(): boolean {
    return this.running;
  }
  readonly read = () => this.snapshot;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  reset(): void {
    this.items = fixtures.queue;
    this.draft = null;
    this.running = true;
    this.steered = [];
    this.publish();
  }

  setRunning(running: boolean): void {
    this.running = running;
    this.publish();
  }

  enqueue(
    text: string,
    attachments?: readonly NativeChatMessageAttachment[],
    modes: Pick<
      NativeChatQueueItem,
      "goalStart" | "operatingRegime" | "effort"
    > = {}
  ) {
    this.items = [
      ...this.items,
      { id: crypto.randomUUID(), text, attachments, ...modes },
    ];
    this.publish();
  }

  readonly readQueuedText = async (inputId: string): Promise<string> => {
    const item = this.items.find((entry) => entry.id === inputId);
    if (!item || item.unavailable)
      throw new Error("Fixture preview unavailable");
    return item.text;
  };

  readonly readQueuedAttachmentPreview = async (
    inputId: string,
    previewId: string
  ): Promise<Blob> => {
    const item = this.items.find((entry) => entry.id === inputId);
    if (!item?.attachments?.some((entry) => entry.previewId === previewId))
      throw new Error("Unknown fixture attachment");
    return fixtures.readImage(previewId);
  };

  async editQueue(action: NativeChatQueueAction): Promise<void> {
    if (action.action === "resume") return;
    const from = this.items.findIndex((entry) => entry.id === action.inputId);
    if (from < 0) return;
    const items = [...this.items];
    if (action.action === "withdraw") {
      items.splice(from, 1);
    } else if (action.action === "replace" || action.action === "replaceText") {
      const item = items[from];
      if (item.unavailable || item.goalStart) return;
      if (action.action === "replaceText") {
        const row = this.snapshot.queue.items.find(
          (entry) => entry.inputId === action.inputId
        );
        if (!this.capabilities.replaceText || row?.textEditable !== true)
          return;
        if (!action.text.trim() && !item.attachments?.length) return;
      } else if (item.attachments?.length || !action.text.trim()) return;
      items[from] = {
        ...item,
        id: crypto.randomUUID(),
        text: action.text,
      };
      this.draft = null;
    } else {
      const to = Math.max(
        0,
        Math.min(
          items.length - 1,
          action.action === "place"
            ? action.index
            : from + (action.direction === "up" ? -1 : 1)
        )
      );
      items.splice(to, 0, items.splice(from, 1)[0]);
    }
    this.items = items;
    if (this.draft?.inputId === action.inputId) this.draft = null;
    this.publish();
  }

  canEditQueuedText(item: NativeChatQueueItem): boolean {
    const original = this.items.find((entry) => entry.id === item.inputId);
    if (
      !this.queueCurrent ||
      this.draft ||
      !this.snapshot.queue.items.includes(item) ||
      !original ||
      original.unavailable ||
      original.goalStart ||
      item.goalStart
    )
      return false;
    return (
      (this.capabilities.replaceText && item.textEditable === true) ||
      (item.preview !== null &&
        item.textOnly !== false &&
        !item.attachments?.length &&
        !original.attachments?.length)
    );
  }

  async editQueuedText(inputId: string): Promise<void> {
    const item = this.items.find((entry) => entry.id === inputId);
    const row = this.snapshot.queue.items.find(
      (entry) => entry.inputId === inputId
    );
    if (!item || !row || !this.canEditQueuedText(row)) return;
    this.draft = {
      inputId,
      text: item.text,
      ...(this.capabilities.replaceText &&
        row.textEditable === true && {
          replaceText: true,
          allowEmpty: !!item.attachments?.length,
        }),
    };
    this.publish();
  }

  changeQueueDraft(text: string): void {
    if (!this.draft) return;
    this.draft = { ...this.draft, text };
    this.publish();
  }

  closeQueueDraft(): void {
    this.draft = null;
    this.publish();
  }

  async saveQueueDraft(text?: string): Promise<boolean> {
    if (!this.draft) return false;
    const edited = { ...this.draft, text: text ?? this.draft.text };
    this.draft = edited;
    this.publish();
    if (!edited.text.trim() && !edited.allowEmpty) return false;
    await this.editQueue({
      action: edited.replaceText ? "replaceText" : "replace",
      inputId: edited.inputId,
      text: edited.text,
    });
    return this.draft === null;
  }

  // The fixture has one page; steering records a local result without inference.
  async showQueuePage(): Promise<void> {}
  canSteerQueued(item: NativeChatQueueItem): boolean {
    const original = this.items.find((entry) => entry.id === item.inputId);
    return (
      this.canSteer &&
      !this.draft &&
      !!original &&
      !original.unavailable &&
      !original.attachments?.length &&
      item.preview !== null &&
      item.textOnly !== false &&
      !item.attachments?.length &&
      !item.goalStart &&
      item.operatingRegime !== "plan" &&
      item.effort !== "ultra"
    );
  }
  async steerQueued(inputId: string): Promise<string | null> {
    const row = this.snapshot.queue.items.find(
      (item) => item.inputId === inputId
    );
    const original = this.items.find((item) => item.id === inputId);
    if (!row || !original || !this.canSteerQueued(row)) return null;
    this.items = this.items.filter((item) => item.id !== inputId);
    this.steered = [...this.steered, original.text];
    if (this.draft?.inputId === inputId) this.draft = null;
    this.publish();
    return null;
  }

  private project() {
    const queue: NativeChatQueuePage = {
      items: this.items.map((item) => ({
        inputId: item.id,
        preview: item.text || null,
        attachments: item.attachments,
        textOnly: !item.attachments?.length && !item.unavailable,
        textEditable: !item.unavailable && !item.goalStart,
        goalStart: item.goalStart,
        operatingRegime: item.operatingRegime,
        effort: item.effort,
      })),
      offset: 0,
      previousOffset: null,
      nextOffset: null,
    };
    return {
      queue,
      count: this.items.length,
      queueDraft: this.draft,
      acting: false,
      queueLoading: false,
      running: this.running,
      steered: this.steered,
    };
  }

  private publish(): void {
    this.snapshot = this.project();
    for (const listener of this.listeners) listener();
  }
}
