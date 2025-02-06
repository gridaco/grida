"use client";
import React, { useCallback, useMemo } from "react";
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

interface IStorageEditor {
  objects: {}[];
  upload: (file: File) => Promise<any>;
  download: (path: string) => Promise<any>;
  list: (path: string) => Promise<EntryItem[]>;
  delete: (path: string) => Promise<any>;
  rename: (path: string, newName: string) => Promise<any>;
  move: (path: string, newPath: string) => Promise<any>;
}

function useStorageEditor(): IStorageEditor {
  const upload = useCallback(async (file: File) => {}, []);
  const download = useCallback(async (path: string) => new Blob(), []);
  const list = useCallback(async (path: string) => [], []);
  const deleteFile = useCallback(async (path: string) => {}, []);
  const rename = useCallback(async (path: string, newName: string) => {}, []);
  const move = useCallback(async (path: string, newPath: string) => {}, []);

  return {
    objects: [],
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

function Tools() {
  return (
    <nav className="flex flex-wrap gap-4">
      <div className="flex flex-col justify-between bg-background border p-4 rounded-lg shadow-sm h-20 aspect-video select-none cursor-pointer">
        <UploadIcon className="w-4 h-4" />
        <span className="text-xs text-muted-foreground">Upload</span>
      </div>
      <div className="flex flex-col justify-between bg-background border p-4 rounded-lg shadow-sm h-20 aspect-video select-none cursor-pointer">
        <FolderIcon className="w-4 h-4" />
        <span className="text-xs text-muted-foreground">Create Folder</span>
      </div>
    </nav>
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
