import type {
  NativeChatMessageAttachment,
  NativeChatQueueItem,
  NativeChatProfileCatalog,
} from "@grida/desktop-bridge";
import type { ComposerCatalog } from "@/kits/composer";

/** Deterministic local examples; no native bridge, account or inference required. */
export namespace DesktopComposerFixtures {
  export const imageUrl = "/images/abstract-placeholder.jpg";
  export const image: NativeChatMessageAttachment = {
    name: "reference.jpg",
    mimeType: "image/jpeg",
    previewId: "local-fixture-image",
  };
  export const file: NativeChatMessageAttachment = {
    name: "README.md",
    mimeType: "text/markdown",
  };
  export const catalog: ComposerCatalog = {
    commands: [
      { id: "plan", title: "Plan", description: "Plan before making changes" },
      {
        id: "goal",
        title: "Goal",
        description: "Work toward a goal with automatic continuation",
      },
      {
        id: "compact",
        title: "Compact",
        description: "Summarize earlier context while keeping the transcript",
      },
      {
        id: "fork",
        title: "Fork",
        description: "Create a separate chat from the latest committed message",
      },
    ],
    mentions: [
      { id: "readme", label: "README.md", kind: "file", path: "README.md" },
      {
        id: "composer",
        label: "composer",
        kind: "file",
        path: "editor/kits/composer",
      },
    ],
  };
  export const profiles: NativeChatProfileCatalog = {
    active: "fixture-a",
    choices: [
      {
        id: "fixture-a",
        connection: "ChatGPT subscription",
        model: "Example model A",
        reasoning: true,
        ultra: true,
      },
      {
        id: "fixture-b",
        connection: "ChatGPT subscription",
        model: "Example model B",
        reasoning: true,
        ultra: true,
      },
      {
        id: "fixture-local",
        connection: "Ollama",
        model: "Example local model",
      },
    ],
    saved: [],
  };
  export type Queued = Readonly<
    {
      id: string;
      text: string;
      attachments?: readonly NativeChatMessageAttachment[];
      unavailable?: boolean;
    } & Pick<NativeChatQueueItem, "goalStart" | "operatingRegime" | "effort">
  >;
  export const queue: readonly Queued[] = [
    {
      id: "multiline",
      text: "Check the composer in both themes.\n\n- Open / and dismiss it outside.\n- Compare the + menu position.\n- Keep this entire queued message readable.",
    },
    {
      id: "image",
      text: "Use this image as the visual reference.\nKeep the spacing and the rounded corners consistent.",
      attachments: [image],
    },
    {
      id: "unavailable",
      text: "A queued message whose preview became unavailable",
      unavailable: true,
    },
  ];
  export async function readImage(previewId: string): Promise<Blob> {
    if (previewId !== image.previewId) throw new Error("Unknown fixture image");
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error("Fixture image unavailable");
    return response.blob();
  }
}
