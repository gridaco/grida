"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FolderIcon,
  MoreHorizontalIcon,
  GridIcon,
  ListIcon,
  UploadIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/utils";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { editorlink } from "@/lib/forms/url";
import { useEditorState } from "@/scaffolds/editor";
import { useRouter, useSearchParams } from "next/navigation";
import { Cross2Icon } from "@radix-ui/react-icons";
import { MimeTypeIcon } from "@/components/mime-type-icon";
import { useFilePicker } from "use-file-picker";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

type PathTokens = string[];

type EntryItem =
  | {
      type: "file";
      name: string;
      key: string;
      path_tokens: PathTokens;
      mimetype: string;
      size?: string;
      modified?: string;
    }
  | {
      type: "folder";
      name: string;
      key: string;
      path_tokens: PathTokens;
      size?: string;
      modified?: string;
    };

type StorageEditorTask = { type: "upload" } | { type: "download" };

interface IStorageEditor {
  tasks: StorageEditorTask[];
  objects: EntryItem[];
  upload: (file: File) => Promise<any>;
  download: (path: string) => Promise<any>;
  list: (path: string) => Promise<EntryItem[]>;
  delete: (path: string) => Promise<any>;
  rename: (path: string, newName: string) => Promise<any>;
  move: (path: string, newPath: string) => Promise<any>;
}

const mockDelay = (ms: number = 300): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function useStorageEditor(): IStorageEditor {
  const [files, setFiles] = useState<EntryItem[]>([
    {
      key: "Documents",
      name: "Documents",
      type: "folder",
      path_tokens: ["Documents"],
    },
    {
      key: "Report.docx",
      name: "Report.docx",
      type: "file",
      path_tokens: ["Report.docx"],
      mimetype:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: "2.3 MB",
      modified: "2023-05-10",
    },
    // ... more dummy entries
  ]);

  const upload = useCallback(async (file: File) => {
    await mockDelay();
    const newFile: EntryItem = {
      type: "file",
      name: file.name,
      key: file.name,
      path_tokens: [file.name],
      mimetype: file.type,
      size: `${file.size} bytes`,
      modified: new Date().toISOString(),
    };
    setFiles((prev) => [...prev, newFile]);
    return newFile;
  }, []);

  const download = useCallback(async (path: string) => {
    await mockDelay();
    return new Blob([`Mock content for ${path}`], { type: "text/plain" });
  }, []);

  const list = useCallback(
    async (path: string) => {
      await mockDelay();
      // For simplicity, no filtering by `path`
      return files;
    },
    [files]
  );

  const deleteFile = useCallback(async (path: string) => {
    await mockDelay();
    setFiles((prev) => prev.filter((item) => item.key !== path));
  }, []);

  const rename = useCallback(async (path: string, newName: string) => {
    await mockDelay();
    setFiles((prev) =>
      prev.map((item) =>
        item.key === path ? { ...item, name: newName, key: newName } : item
      )
    );
  }, []);

  const move = useCallback(async (path: string, newPath: string) => {
    await mockDelay();
    const newTokens = newPath.split("/");
    setFiles((prev) =>
      prev.map((item) =>
        item.key === path
          ? {
              ...item,
              path_tokens: newTokens,
              key: newTokens[newTokens.length - 1],
            }
          : item
      )
    );
  }, []);

  return {
    tasks: [],
    objects: files,
    upload,
    download,
    list,
    delete: deleteFile,
    rename,
    move,
  };
}

function generatePaths(segments: string[]): PathTokens[] {
  return segments.map((_, i) => segments.slice(0, i + 1));
}

const __dummy_files: EntryItem[] = [
  {
    key: "Documents",
    name: "Documents",
    type: "folder",
    path_tokens: ["Documents"],
  },
  { key: "Images", name: "Images", type: "folder", path_tokens: ["Images"] },
  { key: "Music", name: "Music", type: "folder", path_tokens: ["Music"] },
  { key: "Videos", name: "Videos", type: "folder", path_tokens: ["Videos"] },
  {
    path_tokens: ["Report.docx"],
    key: "Report.docx",
    name: "Report.docx",
    type: "file",
    mimetype:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size: "2.3 MB",
    modified: "2023-05-10",
  },
  {
    path_tokens: ["Presentation.pptx"],
    key: "Presentation.pptx",
    name: "Presentation.pptx",
    type: "file",
    mimetype:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    size: "1.5 MB",
    modified: "2023-05-10",
  },
  {
    path_tokens: ["Spreadsheet.xlsx"],
    key: "Spreadsheet.xlsx",
    name: "Spreadsheet.xlsx",
    type: "file",
    mimetype:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: "1.7 MB",
    modified: "2023-05-10",
  },
  {
    path_tokens: ["Image1.jpg"],
    key: "Image1.jpg",
    name: "Image1.jpg",
    type: "file",
    mimetype: "image/jpeg",
    size: "1.2 MB",
    modified: "2023-05-10",
  },
  {
    path_tokens: ["Image2.jpg"],
    key: "Image2.jpg",
    name: "Image2.jpg",
    type: "file",
    mimetype: "image/jpeg",
    size: "1.2 MB",
    modified: "2023-05-10",
  },
  {
    path_tokens: ["Image3.jpg"],
    key: "Image3.jpg",
    name: "Image3.jpg",
    type: "file",
    mimetype: "image/jpeg",
    size: "1.2 MB",
    modified: "2023-05-10",
  },
  {
    path_tokens: ["Music1.mp3"],
    key: "Music1.mp3",
    name: "Music1.mp3",
    type: "file",
    mimetype: "audio/mpeg",
    size: "3.2 MB",
    modified: "2023-05-10",
  },
  {
    path_tokens: ["Music2.mp3"],
    key: "Music2.mp3",
    name: "Music2.mp3",
    type: "file",
    mimetype: "audio/mpeg",
    size: "3.2 MB",
    modified: "2023-05-10",
  },
];

const __tools_card_classes =
  "flex flex-col justify-between bg-background border p-4 rounded-lg shadow-sm h-20 aspect-video select-none cursor-pointer";

function Tools() {
  const { upload } = useStorageEditor();
  const { openFilePicker, filesContent } = useFilePicker({ multiple: false });
  const createFolderDialog = useDialogState();

  useEffect(() => {
    //
  }, [filesContent]);

  return (
    <>
      <nav className="flex flex-wrap gap-4">
        <div className={__tools_card_classes} onClick={openFilePicker}>
          <UploadIcon className="w-4 h-4" />
          <span className="text-xs text-muted-foreground">Upload</span>
        </div>
        <div
          className={__tools_card_classes}
          onClick={createFolderDialog.openDialog}
        >
          <FolderIcon className="w-4 h-4" />
          <span className="text-xs text-muted-foreground">Create Folder</span>
        </div>
      </nav>
      <CreateFolderDialog {...createFolderDialog.props} />
    </>
  );
}

export default function FileExplorer({
  params,
}: {
  params: {
    id: string;
    org: string;
    proj: string;
    path?: string[];
  };
}) {
  const { path = [] } = params;
  const searchparams = useSearchParams();
  const preview = searchparams.get("preview");
  const [state] = useEditorState();
  const [viewMode, setViewMode] = React.useState<"grid" | "list">("list");

  const paths = useMemo(() => generatePaths(path), [path]);
  const router = useRouter();

  const files = __dummy_files;

  const onFileDoubleClick = (e: React.MouseEvent, file: EntryItem) => {
    const href =
      file.type === "folder"
        ? editorlink("objects/[[...path]]", {
            path: file.path_tokens,
            document_id: state.document_id,
            basepath: state.basepath,
          })
        : "?preview=" + file.path_tokens.join("/");
    if (e.metaKey || e.ctrlKey) {
      open(href, "_blank");
    } else {
      router.push(href);
    }
  };

  return (
    <div className="flex flex-1 h-full">
      <aside className="w-full container mx-auto p-4 overflow-y-scroll">
        <div className="my-8">
          <Tools />
        </div>
        <div className="mb-4 flex items-center justify-between">
          <nav className="flex items-center space-x-2 text-sm text-muted-foreground">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink
                    href={editorlink("objects", {
                      document_id: state.document_id,
                      basepath: state.basepath,
                    })}
                  >
                    Home
                  </BreadcrumbLink>
                </BreadcrumbItem>
                {paths.map((path, index) => {
                  const href = editorlink("objects/[[...path]]", {
                    path: path,
                    document_id: state.document_id,
                    basepath: state.basepath,
                  });
                  const label = path[path.length - 1];
                  return (
                    <React.Fragment key={index}>
                      <BreadcrumbSeparator />
                      <BreadcrumbItem>
                        <BreadcrumbLink href={href}>{label}</BreadcrumbLink>
                      </BreadcrumbItem>
                    </React.Fragment>
                  );
                })}
              </BreadcrumbList>
            </Breadcrumb>
          </nav>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setViewMode("grid")}
              className={cn(viewMode === "grid" && "bg-muted")}
            >
              <GridIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setViewMode("list")}
              className={cn(viewMode === "list" && "bg-muted")}
            >
              <ListIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {files.length === 0 ? (
          <FolderEmptyState />
        ) : (
          <>
            {viewMode === "grid" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {__dummy_files.map((file, index) => (
                  <FileItemComponent
                    key={index}
                    file={file}
                    view={viewMode}
                    onDoubleClick={(e) => {
                      onFileDoubleClick(e, file);
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col space-y-2">
                <div className="flex items-center justify-between px-2 py-1 font-medium text-muted-foreground">
                  <span className="w-1/2 text-sm">Name</span>
                  <span className="w-1/4 text-sm">Size</span>
                  <span className="w-1/4 text-sm">Modified</span>
                </div>
                {__dummy_files.map((file, index) => (
                  <FileItemComponent
                    key={index}
                    file={file}
                    view={viewMode}
                    onDoubleClick={(e) => {
                      onFileDoubleClick(e, file);
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </aside>
      {preview && (
        <aside className="border-s">
          <FilePreviewSidebar />
        </aside>
      )}
    </div>
  );
}

const FileItemComponent = ({
  file,
  view,
  className,
  ...props
}: {
  file: EntryItem;
  view: "grid" | "list";
} & React.HtmlHTMLAttributes<HTMLDivElement>) => {
  const commonClasses =
    "group relative flex items-center rounded-lg p-2 transition-colors hover:bg-muted select-none cursor-pointer";

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div
          className={cn(
            commonClasses,
            className,
            view === "grid"
              ? "flex-col items-center justify-center aspect-square"
              : "flex items-center justify-between"
          )}
          {...props}
        >
          {view === "grid" ? (
            <div className="flex flex-col items-center">
              <MimeTypeIcon
                type={file.type === "folder" ? "folder" : file.mimetype}
                className="w-6 h-6"
              />
              <span className="mt-2 text-sm font-medium">{file.name}</span>
            </div>
          ) : (
            <>
              <span className="w-1/2 text-sm font-medium">
                <MimeTypeIcon
                  type={file.type === "folder" ? "folder" : file.mimetype}
                  className="inline align-middle me-2 w-4 h-4"
                />
                {file.name}
              </span>
              <span className="w-1/4 text-sm text-muted-foreground">
                {file.size}
              </span>
              <span className="w-1/4 text-sm text-muted-foreground">
                {file.modified}
              </span>
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="absolute right-1 top-1 h-8 w-8 p-0 opacity-0 group-hover:opacity-100"
              >
                <MoreHorizontalIcon className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Rename</DropdownMenuItem>
              <DropdownMenuItem>Move</DropdownMenuItem>
              <DropdownMenuItem>Download</DropdownMenuItem>
              <DropdownMenuItem>Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem>Open</ContextMenuItem>
        <ContextMenuItem>Rename</ContextMenuItem>
        <ContextMenuItem>Move</ContextMenuItem>
        <ContextMenuItem>Download</ContextMenuItem>
        <ContextMenuItem>Delete</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

function FilePreviewSidebar() {
  return (
    <div className="min-w-96 h-full p-4">
      <Button variant="ghost" size="icon">
        <Cross2Icon />
      </Button>
    </div>
  );
}

function CreateFolderDialog({ ...props }: React.ComponentProps<typeof Dialog>) {
  return (
    <Dialog {...props}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <FolderIcon className="w-5 h-5 inline me-2 align-middle" />
            Create folder
          </DialogTitle>
        </DialogHeader>
        <hr />
        <div>
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input
              autoFocus
              autoComplete="off"
              name="name"
              placeholder="Folder name"
              pattern="^(?!.*\/).+$"
              title="Folder name must not contain '/'"
            />
          </div>
        </div>
        <hr />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FolderEmptyState() {
  return (
    <div className="w-full px-4 py-8 flex flex-col items-center justify-center gap-4">
      <h6 className="text-lg">Drop files here to upload</h6>
      <Button>Upload</Button>
    </div>
  );
}
