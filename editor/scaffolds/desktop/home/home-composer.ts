import type { NativeChatEffort } from "@grida/desktop-bridge";
import { ComposerDrafts } from "@/lib/agent-chat/composer-drafts";
import type { ComposerTransfer } from "@/kits/composer";
import type { Workspace } from "@/lib/desktop/bridge";
import {
  welcome_message,
  type WelcomeMessage,
  type WelcomeTemplate,
} from "@/lib/desktop/welcome-message";

/** Unsent Home intent. Native capabilities are checked after workspace admission. */
export class HomeComposer {
  static readonly key = "desktop-home";
  private static readonly drafts = new ComposerDrafts();
  private listeners = new Set<() => void>();
  private attachmentRevision = 0;
  private restoration?: Promise<void>;
  private effortChosen = false;
  private effortInitialized = false;
  private view: HomeComposer.View;

  constructor(readonly drafts = HomeComposer.drafts) {
    const modes = drafts.readModes(HomeComposer.key);
    this.view = {
      effort: "standard",
      plan: !!modes.plan,
      goal: !!modes.goal,
      attachment: null,
      notice: null,
      busy: false,
    };
  }

  read = (): HomeComposer.View => this.view;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Relative workspace mentions must never follow a different destination. */
  draftFor(destination: string): { key: string; store: ComposerDrafts } {
    return { key: `${HomeComposer.key}:${destination}`, store: this.drafts };
  }

  restore(): Promise<void> {
    return (this.restoration ??= this.restoreAttachment());
  }

  private async restoreAttachment(): Promise<void> {
    const revision = this.attachmentRevision;
    const stored = await this.drafts.readAttachment(HomeComposer.key);
    if (!stored || revision !== this.attachmentRevision) return;
    const file =
      stored.kind === "image" || stored.kind === "reference"
        ? stored.file
        : new File([stored.bytes], stored.name, {
            type: stored.kind === "png" ? "image/png" : "",
          });
    this.update({
      goal: false,
      attachment: {
        kind:
          stored.kind === "reference" && stored.mimeType === "inode/directory"
            ? "directory"
            : "file",
        file,
      },
    });
  }

  selectEffort = (effort: NativeChatEffort): void => {
    if (this.view.busy) return;
    this.effortChosen = true;
    this.update({ effort });
  };

  /** A late catalog refresh cannot replace an explicit composer choice. */
  initializeEffort(effort: NativeChatEffort | undefined): void {
    if (effort && !this.effortChosen && !this.view.busy) {
      this.effortInitialized = true;
      this.update({ effort });
    }
  }
  selectPlan = (plan: boolean): void => {
    if (this.view.busy) return;
    this.update({ plan });
    this.saveModes();
  };
  selectGoal = (goal: boolean): void => {
    if (this.view.busy) return;
    if (goal && this.view.attachment) {
      this.update({
        notice: "Send or remove the attachment before starting a goal.",
      });
      return;
    }
    this.update({ goal, notice: null });
    this.saveModes();
  };

  transfer = ({
    resources,
  }: Pick<ComposerTransfer.Event, "resources">): void => {
    if (this.view.busy || !resources.length) return;
    if (resources.length !== 1) {
      this.update({ notice: "Attach one file at a time." });
      return;
    }
    if (this.view.goal) {
      this.update({ notice: "Remove the goal intent to attach a file." });
      return;
    }
    const resource = resources[0];
    this.attachmentRevision++;
    this.update({ attachment: resource, notice: null });
    const image =
      resource.kind === "file" &&
      /^image\/(png|jpeg|webp|gif)$/.test(resource.file.type);
    void this.drafts.writeAttachment(
      HomeComposer.key,
      image
        ? { kind: "image", name: resource.file.name, file: resource.file }
        : {
            kind: "reference",
            name: resource.file.name,
            file: resource.file,
            mimeType:
              resource.kind === "directory"
                ? "inode/directory"
                : resource.file.type,
          }
    );
  };

  removeAttachment = (): void => {
    if (!this.view.busy) this.clearAttachment();
  };

  private clearAttachment(): void {
    this.attachmentRevision++;
    this.update({ attachment: null, notice: null });
    void this.drafts.writeAttachment(HomeComposer.key, null);
  }

  /** Prepare one first request before navigating; failures retain the staged draft. */
  async submit(
    input: HomeComposer.Input,
    host: HomeComposer.Host
  ): Promise<void> {
    if (this.view.busy) throw new Error("A workspace is already opening.");
    this.update({ busy: true });
    let opened = false;
    try {
      await this.restore();
      const intent = this.view;
      const workspace = input.target ?? (await host.defaultWorkspace());
      if (!workspace)
        throw new Error("No default workspace available on this host.");
      const template = await input.copyTemplate?.(workspace.id);
      const hasRequest =
        !!input.text.trim() ||
        !!template ||
        input.references.length > 0 ||
        !!intent.attachment;
      if (hasRequest) {
        const text =
          welcome_message.compose({
            text: input.prompt,
            references: input.references,
            template,
          }) ?? "Inspect the attached file.";
        if (
          !host.stash(workspace.id, {
            text,
            profileId: input.profileId,
            ...((this.effortChosen || this.effortInitialized) && {
              effort: intent.effort,
            }),
            operatingRegime: intent.plan ? "plan" : "act",
            goal: intent.goal,
            ...(intent.attachment && { attachment: intent.attachment }),
          })
        )
          throw new Error("Couldn't keep your message for the workspace.");
      }
      host.open(workspace);
      opened = true;
      this.accepted();
    } finally {
      if (!opened) this.update({ busy: false });
    }
  }

  /** The workspace now owns the handed-off request. */
  accepted(): void {
    this.clearAttachment();
    this.update({ plan: false, goal: false });
    this.saveModes();
  }

  private saveModes(): void {
    this.drafts.writeModes(HomeComposer.key, {
      ...(this.view.plan && { plan: true }),
      ...(this.view.goal && { goal: true }),
    });
  }
  private update(patch: Partial<HomeComposer.View>): void {
    this.view = { ...this.view, ...patch };
    this.listeners.forEach((listener) => listener());
  }
}

export namespace HomeComposer {
  export type Attachment = Readonly<{ kind: "file" | "directory"; file: File }>;
  export type View = Readonly<{
    effort: NativeChatEffort;
    plan: boolean;
    goal: boolean;
    attachment: Attachment | null;
    notice: string | null;
    busy: boolean;
  }>;
  export type Input = Readonly<{
    text: string;
    prompt: string;
    profileId: string | null;
    target: Workspace | null;
    references: readonly { title: string; url: string }[];
    copyTemplate?: (workspaceId: string) => Promise<WelcomeTemplate>;
  }>;
  export type Host = Readonly<{
    defaultWorkspace(): Promise<Workspace | null>;
    stash(workspaceId: string, message: WelcomeMessage): boolean;
    open(workspace: Workspace): void;
  }>;
}
