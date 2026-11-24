import type {
  NativeChatMessageAttachment,
  NativeChatQueueItem,
  NativeChatProfileCatalog,
  WebPreview,
} from "@grida/desktop-bridge";
import type { ComposerCatalog } from "@/kits/composer";
import type { LibraryExplorerPageLoader } from "@/kits/library-explorer";
import { encodeLibraryPng } from "@/lib/agent-chat/image-attachment";

/** Deterministic local examples; no native bridge, account or inference required. */
export namespace DesktopComposerFixtures {
  export async function loadWebPreview(
    href: string,
    signal: AbortSignal
  ): Promise<WebPreview.Metadata | null> {
    switch (new URL(href).pathname) {
      case "/gallery":
        return {
          title: "Gallery tour",
          description: "An exhibition guide with three stops.",
          favicon: {
            dataUrl:
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPg/88AAAIvAQ+3s0AMAAAAAElFTkSuQmCC",
          },
        };
      case "/plan":
        return {
          title: "Gallery cover workflow",
          productLabel: "FX Viewer",
          description: "Browse workflow plans and runs.",
        };
      case "/print":
        return new Promise((resolve) => {
          const timer = window.setTimeout(() => {
            signal.removeEventListener("abort", abort);
            resolve({
              title: "Print layout",
              description: "A print-ready version of the gallery guide.",
            });
          }, 1800);
          const abort = () => {
            window.clearTimeout(timer);
            resolve(null);
          };
          signal.addEventListener("abort", abort, { once: true });
        });
      default:
        return null;
    }
  }

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
      id: "file-only",
      text: "",
      attachments: [file],
    },
  ];
  export async function readImage(previewId: string): Promise<Blob> {
    if (previewId !== image.previewId) throw new Error("Unknown fixture image");
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error("Fixture image unavailable");
    return response.blob();
  }

  const libraryImage = {
    id: "gallery-cover",
    title: "Gallery cover study",
    mime: "image/jpeg",
    url: imageUrl,
  };
  const loadLibraryPage: LibraryExplorerPageLoader = async (_, [start]) => ({
    items: start === 0 ? [libraryImage] : [],
    exactCount: 1,
  });
  export const libraryRequestSource = {
    loadPage: loadLibraryPage,
    async readPng(id: string, maxBytes: number) {
      if (id !== libraryImage.id) throw new Error("Unknown Library reference");
      const file = await readImage(image.previewId!);
      return encodeLibraryPng(
        { mime: libraryImage.mime, bytes: await file.arrayBuffer() },
        maxBytes
      );
    },
  };
}
