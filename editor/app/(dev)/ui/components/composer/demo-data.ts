import type {
  ComposerAttachmentInput,
  ComposerAttachmentFilter,
  ComposerCatalog,
  ComposerFileAttachment,
  ComposerFileReference,
} from "@/kits/composer";

export type MockFile = {
  kind: "file";
  id: string;
  name: string;
  path: string;
  publicPath?: string;
  mime: string;
  size: number;
  folder: string;
};

export type MockFolder = {
  kind: "folder";
  id: string;
  name: string;
  path: string;
  mime: "inode/directory";
  size: 0;
  folder: string;
};

export type MockItem = MockFile | MockFolder;

export type DropMode = "auto" | "inline" | "card";

export type ResolvedDropMode = Exclude<DropMode, "auto">;

export const folders: MockFolder[] = [
  {
    kind: "folder",
    id: "folder-public-images",
    name: "images",
    path: "editor/public/images",
    mime: "inode/directory",
    size: 0,
    folder: "public/images",
  },
  {
    kind: "folder",
    id: "folder-public-objects",
    name: "template-grida-customer-upload-csv-example",
    path: "editor/public/objects/template-grida-customer-upload-csv-example",
    mime: "inode/directory",
    size: 0,
    folder: "public/objects",
  },
  {
    kind: "folder",
    id: "folder-public-examples-canvas",
    name: "canvas",
    path: "editor/public/examples/canvas",
    mime: "inode/directory",
    size: 0,
    folder: "public/examples/canvas",
  },
];

export const files: MockFile[] = [
  {
    kind: "file",
    id: "public-abstract-placeholder",
    name: "abstract-placeholder.jpg",
    path: "editor/public/images/abstract-placeholder.jpg",
    publicPath: "/images/abstract-placeholder.jpg",
    mime: "image/jpeg",
    size: 148734,
    folder: "public/images",
  },
  {
    kind: "file",
    id: "public-brand-symbol",
    name: "grida-symbol-240.svg",
    path: "editor/public/brand/grida-symbol-240.svg",
    publicPath: "/brand/grida-symbol-240.svg",
    mime: "image/svg+xml",
    size: 1852,
    folder: "public/brand",
  },
  {
    kind: "file",
    id: "public-form-schema",
    name: "form.schema.json",
    path: "editor/public/schema/form.schema.json",
    publicPath: "/schema/form.schema.json",
    mime: "application/json",
    size: 6312,
    folder: "public/schema",
  },
  {
    kind: "file",
    id: "public-csv-basic",
    name: "insert-example-basic.csv",
    path: "editor/public/objects/template-grida-customer-upload-csv-example/insert-example-basic.csv",
    publicPath:
      "/objects/template-grida-customer-upload-csv-example/insert-example-basic.csv",
    mime: "text/csv",
    size: 324,
    folder: "public/objects",
  },
  {
    kind: "file",
    id: "public-readme",
    name: "readme.txt",
    path: "editor/public/objects/template-grida-customer-upload-csv-example/readme.txt",
    publicPath:
      "/objects/template-grida-customer-upload-csv-example/readme.txt",
    mime: "text/plain",
    size: 1202,
    folder: "public/objects",
  },
  {
    kind: "file",
    id: "public-canvas-example",
    name: "poster-happy-new-year-2026.grida1",
    path: "editor/public/examples/canvas/poster-happy-new-year-2026.grida1",
    publicPath: "/examples/canvas/poster-happy-new-year-2026.grida1",
    mime: "application/vnd.grida.canvas",
    size: 7142,
    folder: "public/examples/canvas",
  },
  {
    kind: "file",
    id: "public-thumbnail",
    name: "image-01.png",
    path: "editor/public/mock/thumbnails/image-01.png",
    publicPath: "/mock/thumbnails/image-01.png",
    mime: "image/png",
    size: 288216,
    folder: "public/mock/thumbnails",
  },
];

export const sidebarItems: MockItem[] = [...folders, ...files];

export const commands: ComposerCatalog["commands"] = [
  {
    id: "review",
    title: "Review",
    description: "Lower a code or design review request into a command part.",
  },
  {
    id: "search",
    title: "Search",
    description: "Capture a search intent before the message reaches a model.",
  },
  {
    id: "rewrite",
    title: "Rewrite",
    description: "Ask for a rewrite while preserving selected context.",
  },
];

export const demoCatalog: ComposerCatalog = {
  commands,
  mentions: [
    ...files.map((file) => ({
      id: file.id,
      kind: "file" as const,
      label: file.name,
      path: file.path,
      description: file.path,
    })),
    ...folders.map((folder) => ({
      id: folder.id,
      kind: "folder" as const,
      label: folder.name,
      path: folder.path,
      description: folder.path,
    })),
    {
      id: "skill-canvas-docs-svg-kit",
      kind: "skill",
      label: "canvas-docs-svg-kit",
      description: "SVG figures for canvas docs.",
    },
    {
      id: "symbol-composer-core",
      kind: "symbol",
      label: "ComposerCore",
      description: "Core class for the composer kit.",
    },
  ],
};

export const demoAttachmentFilters = {
  byReference: ((incoming, existing) => {
    const incomingKey = attachmentReferenceKey(incoming);
    return !existing.some((attachment) => {
      const existingKey = attachmentReferenceKey(attachment);
      return existingKey === incomingKey;
    });
  }) satisfies ComposerAttachmentFilter,
};

function attachmentReferenceKey(attachment: ComposerAttachmentInput): string {
  return attachment.kind === "directory"
    ? attachment.ref.path
    : (attachment.path ?? attachment.url ?? attachment.name);
}

export function toAttachment(
  file: MockItem
): Omit<ComposerFileAttachment, "id"> {
  return {
    name: file.name,
    path: file.path,
    mime: file.mime,
    size: file.size,
    url: file.kind === "file" ? file.publicPath : undefined,
  };
}

export function toFileReference(file: MockItem): ComposerFileReference {
  return {
    id: `inline-${file.id}`,
    name: file.name,
    path: file.path,
    mime: file.mime,
    size: file.size,
    url: file.kind === "file" ? file.publicPath : undefined,
  };
}

export function resolveDropMode(
  file: MockItem,
  mode: DropMode
): ResolvedDropMode {
  if (mode !== "auto") return mode === "card" ? "card" : "inline";
  return isImageFile(file) ? "card" : "inline";
}

export const mockFileDragType = "application/x-grida-composer-file";

export function readMockItem(payload: string): MockItem | null {
  try {
    const value = JSON.parse(payload) as Partial<MockItem>;
    if (
      (value.kind === "file" || value.kind === "folder") &&
      typeof value.id === "string" &&
      typeof value.name === "string" &&
      typeof value.path === "string" &&
      typeof value.mime === "string" &&
      typeof value.size === "number" &&
      typeof value.folder === "string"
    ) {
      return value as MockItem;
    }
  } catch {
    return null;
  }
  return null;
}

export function isImageFile(file: MockItem): file is MockFile {
  return file.kind === "file" && file.mime.startsWith("image/");
}
