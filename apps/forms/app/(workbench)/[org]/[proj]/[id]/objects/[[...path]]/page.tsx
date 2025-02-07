"use client";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from "react";
import { produce } from "immer";
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
import { CaretDownIcon, Cross2Icon } from "@radix-ui/react-icons";
import { MimeTypeIcon } from "@/components/mime-type-icon";
import { useFilePicker } from "use-file-picker";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { StandaloneMediaView } from "@/components/mediaviewer";
import { wellkown } from "@/utils/mimetype";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function fmtbytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const __mock_elay = (ms: number = 300): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

type PathTokens = string[];

type FileNode = {
  type: "file";
  name: string;
  key: string;
  path_tokens: PathTokens;
  mimetype: string;
  size?: number;
  modified?: string;
  url: string;
  thumbnail?: string;
};

type FolderNode = {
  type: "folder";
  name: string;
  key: string;
  path_tokens: PathTokens;
  size?: number;
  modified?: string;
};

type NodeItem = FileNode | FolderNode;

type StorageEditorTask = { type: "upload" } | { type: "download" };

interface StorageEditorState {
  refreshkey: number;
  dir: string;
  tasks: StorageEditorTask[];
  nodes: Record<string, NodeItem>;
}

const StorageEditorContext = React.createContext<StorageEditorState | null>(
  null
);
const StorageEditorProvider = StorageEditorContext.Provider;
const StorageEditorDispatcherContext = React.createContext<
  (action: StorageEditorAction) => void
>(() => {});
const StorageEditorDispatcherProvider = StorageEditorDispatcherContext.Provider;

function __useDispatch() {
  const context = React.useContext(StorageEditorDispatcherContext);
  if (!context) {
    throw new Error("useDispatch must be used within a StorageEditorProvider");
  }
  return context;
}

function __useStorageEditorState() {
  const context = React.useContext(StorageEditorContext);
  if (!context) {
    throw new Error(
      "useStorageEditor must be used within a StorageEditorProvider"
    );
  }
  return context;
}

type StorageEditorAction =
  | { type: "cd"; dir: string }
  | { type: "refresh" }
  | { type: "add"; key: string; node: NodeItem }
  | { type: "remove"; key: string };

function reducer(
  state: StorageEditorState,
  action: StorageEditorAction
): StorageEditorState {
  return produce(state, (draft) => {
    switch (action.type) {
      case "cd": {
        draft.dir = action.dir;
        break;
      }
      case "add": {
        const { key, node } = action;
        draft.nodes[key] = { ...node, key } satisfies NodeItem;
        break;
      }
      case "refresh": {
        draft.refreshkey++;
        break;
      }
    }
  });
}

interface IStorageEditor extends Omit<StorageEditorState, "nodes"> {
  nodes: NodeItem[];
  upload: (file: File) => Promise<any>;
  cd: (dir: string) => void;
  // download: (path: string) => Promise<any>;
  // list: (path: string) => Promise<NodeItem[]>;
  refresh: () => void;
  delete: (path: string) => Promise<any>;
  // rename: (path: string, newName: string) => Promise<any>;
  // move: (path: string, newPath: string) => Promise<any>;
}

function useStorageEditor(): IStorageEditor {
  const {
    dir,
    refreshkey,
    nodes: __all_nodes,
    tasks,
  } = __useStorageEditorState();
  const dispatch = __useDispatch();

  const currentTokens = useMemo(
    () => (dir ? dir.split("/").filter(Boolean) : []),
    [dir]
  );

  const currentDirNodes: NodeItem[] = useMemo(() => {
    return Object.values(__all_nodes).filter(
      (node) =>
        node.path_tokens.length === currentTokens.length + 1 &&
        currentTokens.every((token, i) => token === node.path_tokens[i])
    );
  }, [__all_nodes, currentTokens]);

  const __cd = useCallback(
    (dir: string) => {
      dispatch({ type: "cd", dir });
    },
    [dispatch]
  );

  const __refresh = useCallback(() => {
    dispatch({ type: "refresh" });
  }, [dispatch]);

  const __add = useCallback(
    (key: string, node: NodeItem) => {
      dispatch({ type: "add", key, node });
    },
    [dispatch]
  );

  const __remove = useCallback(
    (key: string) => {
      dispatch({ type: "remove", key });
    },
    [dispatch]
  );

  const upload = useCallback(
    async (file: File) => {
      await __mock_elay();
      const url = URL.createObjectURL(file);
      const newFile: NodeItem = {
        type: "file",
        name: file.name,
        key: file.name,
        path_tokens: [file.name],
        mimetype: file.type,
        size: file.size,
        modified: new Date().toISOString(),
        url: url,
        thumbnail: url,
      };
      __add(file.name, newFile);
      return newFile;
    },
    [__add]
  );

  const deleteFile = useCallback(
    async (key: string) => {
      await __mock_elay();
      __remove(key);
    },
    [__remove]
  );

  return {
    refreshkey,
    dir,
    tasks,
    nodes: currentDirNodes,
    upload,
    cd: __cd,
    refresh: __refresh,
    delete: deleteFile,
  };
}

function generatePaths(segments: string[]): PathTokens[] {
  return segments.map((_, i) => segments.slice(0, i + 1));
}

const __tools_card_classes =
  "flex flex-col justify-between bg-background border p-4 rounded-lg shadow-sm h-20 aspect-video select-none cursor-pointer";

function Tools() {
  const { upload } = useStorageEditor();
  const { openFilePicker, plainFiles } = useFilePicker({ multiple: false });
  const createFolderDialog = useDialogState();

  useEffect(() => {
    plainFiles.forEach((file) => {
      console.log("Uploading file", file);
      upload(file);
    });
  }, [plainFiles, upload]);

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
  const [state, dispatch] = useReducer(reducer, {
    nodes: {},
    dir: path.join("/"),
    refreshkey: 0,
    tasks: [],
  });

  return (
    <StorageEditorProvider value={state}>
      <StorageEditorDispatcherProvider value={dispatch}>
        {<Folder />}
      </StorageEditorDispatcherProvider>
    </StorageEditorProvider>
  );
}

function Folder() {
  const searchparams = useSearchParams();
  const [state] = useEditorState();
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const { dir, nodes } = useStorageEditor();

  const paths = useMemo(() => generatePaths(dir.split("/")), [dir]);
  const router = useRouter();

  const previewkey = searchparams.get("preview");
  const previewfile = nodes.find((n) => n.name === previewkey);

  const onFileClick = (e: React.MouseEvent, file: NodeItem) => {
    if (file.type === "folder") return;
    router.push("?preview=" + file.name);
  };

  const onFileDoubleClick = (e: React.MouseEvent, file: NodeItem) => {
    const href =
      file.type === "folder"
        ? editorlink("objects/[[...path]]", {
            path: file.path_tokens,
            document_id: state.document_id,
            basepath: state.basepath,
          })
        : "?preview=" + file.name;
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
        {nodes.length === 0 ? (
          <FolderEmptyState />
        ) : (
          <>
            {viewMode === "grid" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {nodes.map((file, index) => (
                  <FileItemComponent
                    key={index}
                    file={file}
                    view={viewMode}
                    onClick={(e) => onFileClick(e, file)}
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
                {nodes.map((file, index) => (
                  <FileItemComponent
                    key={index}
                    file={file}
                    view={viewMode}
                    onClick={(e) => onFileClick(e, file)}
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
      {previewfile?.type === "file" && (
        <aside className="border-s">
          <FilePreviewSidebar
            file={previewfile}
            onClose={() => router.push("?preview")}
          />
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
  file: NodeItem;
  view: "grid" | "list";
} & React.HtmlHTMLAttributes<HTMLDivElement>) => {
  const commonClasses =
    "group relative flex items-center rounded-lg p-2 transition-colors select-none cursor-pointer";

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div
          className={cn(
            commonClasses,
            className,
            view === "grid"
              ? "flex-col items-center justify-center"
              : "flex items-center justify-between hover:bg-muted"
          )}
          {...props}
        >
          {view === "grid" ? (
            <div className="flex flex-col items-center">
              <div className="w-full h-full aspect-square flex items-center justify-center group-hover:bg-muted rounded">
                <MimeTypeIcon
                  type={file.type === "folder" ? "folder" : file.mimetype}
                  className="w-6 h-6"
                />
              </div>
              <span className="mt-2 text-sm font-medium">{file.name}</span>
            </div>
          ) : (
            <>
              <span className="w-1/2 text-sm font-medium truncate">
                <MimeTypeIcon
                  type={file.type === "folder" ? "folder" : file.mimetype}
                  className="inline align-middle me-2 w-4 h-4"
                />
                {file.name}
              </span>
              <span className="w-1/4 text-sm text-muted-foreground truncate">
                {file.size ? fmtbytes(file.size) : ""}
              </span>
              <span className="w-1/4 text-sm text-muted-foreground truncate">
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

function FilePreviewSidebar({
  file,
  onClose,
}: {
  file: FileNode;
  onClose?: () => void;
}) {
  const createlinkDialog = useDialogState();

  return (
    <>
      <div className="min-w-96 max-w-96 h-full flex flex-col">
        <header className="flex items-center justify-start px-2 py-4 border-b gap-2">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <Cross2Icon />
          </Button>
          <span className="text-sm font-medium truncate">{file.name}</span>
          <div className="ms-auto flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  Share
                  <CaretDownIcon className="ms-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="bottom" align="end">
                <DropdownMenuItem>Copy Link</DropdownMenuItem>
                <DropdownMenuItem onSelect={createlinkDialog.openDialog}>
                  Create Viewer Link
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <div className="w-full h-full px-4 py-8 overflow-y-scroll">
          <div className="w-full h-full min-h-96">
            {file.thumbnail && (
              <StandaloneMediaView
                mediaSrc={{ src: file.thumbnail }}
                contentType={file.mimetype}
              />
            )}
          </div>
        </div>
      </div>
      <CreateViewerLinkDialog file={file} {...createlinkDialog.props} />
    </>
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
  const { openFilePicker, plainFiles } = useFilePicker({ multiple: false });
  const { upload } = useStorageEditor();

  useEffect(() => {
    plainFiles.forEach((file) => {
      upload(file);
    });
  }, [plainFiles, upload]);

  return (
    <div className="w-full px-4 py-16 flex flex-col items-center justify-center gap-4 border border-dashed rounded-lg">
      <UploadIcon className="w-8 h-8" />
      <h6 className="text-lg text-muted-foreground">
        Drop files here to upload
      </h6>
      <Button onClick={openFilePicker}>Upload</Button>
    </div>
  );
}

function CreateViewerLinkDialog({
  file,
  ...props
}: React.ComponentProps<typeof Dialog> & { file: FileNode }) {
  const known = wellkown(file.mimetype);
  return (
    <Dialog {...props}>
      <DialogContent className="flex flex-col max-w-[calc(100vw-2rem)] h-[calc(100dvh-2rem)]">
        <DialogHeader>
          <DialogTitle>Create Sharable Viewer Link</DialogTitle>
          <DialogDescription></DialogDescription>
        </DialogHeader>
        <div className="w-full flex-1 overflow-hidden">
          {known === "pdf" && (
            <>
              <Tabs className="w-full h-full">
                <TabsList>
                  <TabsTrigger value="plain">Plain</TabsTrigger>
                  <TabsTrigger value="flipbook">Flip Book</TabsTrigger>
                </TabsList>
                <TabsContent value="plain" className="w-full h-full">
                  <object
                    data={file.url}
                    type={file.mimetype}
                    width="100%"
                    height="100%"
                  />
                </TabsContent>
                <TabsContent value="flipbook" className="w-full h-full">
                  <iframe
                    src={`https://viewer.grida.co/pdf?file=${file.url}&app=page-flip`}
                    width="100%"
                    height="100%"
                  />
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
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
