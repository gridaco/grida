"use client";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from "react";
import { format } from "date-fns";
import Link from "next/link";
import { FolderIcon, GridIcon, ListIcon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CaretDownIcon,
  CheckCircledIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Cross2Icon,
  CrossCircledIcon,
  TrashIcon,
  DotsHorizontalIcon,
  InputIcon,
  ExclamationTriangleIcon,
  LockOpen1Icon,
  ReloadIcon,
} from "@radix-ui/react-icons";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Spinner } from "@/components/spinner";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { fmt_bytes } from "@/utils/fmt";
import StorageEditorProvider, {
  reducer,
  StorageApi,
  StorageEditorDispatcherProvider,
  StorageEditorTask,
  StorageEditorUploadingTask,
  useSeedList,
  useStorageEditor,
} from "@/scaffolds/storage/core";
import toast from "react-hot-toast";
import { useQueryState } from "@/utils/use-query-state";
import CreateViewerLinkDialog from "@/scaffolds/storage/dialog-create-sharable-link";
import { vfs } from "@/lib/vfs";
import { createBrowserClient } from "@/lib/supabase/client";

/**
 * function to return a value from a list of options or a fallback value
 *
 * often used with optional query parameters
 */
function q<T>(s: string | null, options: T[], fallback: T): T {
  return options.includes(s as any) ? (s as any) : fallback;
}

const __tools_card_classes =
  "flex flex-col justify-between bg-background border p-4 rounded-lg shadow-sm h-20 aspect-video select-none cursor-pointer";

function Tools() {
  const { upload } = useStorageEditor();
  const { openFilePicker, plainFiles } = useFilePicker({ multiple: true });
  const createFolderDialog = useDialogState("mkdir", { refreshkey: true });

  useEffect(() => {
    plainFiles.forEach((file) => {
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
      <CreateFolderDialog
        key={createFolderDialog.refreshkey}
        {...createFolderDialog.props}
      />
    </>
  );
}

const BUCLET = {
  public: "storage-public",
  private: "storage-private",
};

export default function FileExplorer({
  params,
}: {
  // TODO: [next15](https://nextjs.org/docs/app/building-your-application/upgrading/version-15#asynchronous-page)
  params: {
    id: string;
    org: string;
    proj: string;
    path?: string[];
  };
}) {
  const [{ document_id }] = useEditorState();

  const api: StorageApi = useMemo(() => {
    const client = createBrowserClient();
    const __api = client.storage.from(BUCLET.public);
    // const rmrf = async (path: string) => {
    //   alert("not ready");
    // };
    // __api["rmrf"] = rmrf;
    return __api as StorageApi;
  }, []);

  const { path = [] } = params;
  const [state, dispatch] = useReducer(reducer, {
    loading: true,
    bucket_id: BUCLET.public,
    public: true,
    objects: {},
    basepath: document_id,
    dir: path.join("/"),
    absdir: document_id + "/" + path.join("/"),
    refreshkey: 0,
    tasks: [],
    api: api,
  });

  return (
    <StorageEditorProvider value={state}>
      <StorageEditorDispatcherProvider value={dispatch}>
        <Folder />
      </StorageEditorDispatcherProvider>
    </StorageEditorProvider>
  );
}

type View = "grid" | "list";

function Folder() {
  const searchParams = useSearchParams();
  const [state] = useEditorState();
  const deleteConfirmDialog = useDialogState<vfs.EntityNode>("confirm-delete");
  const storage = useStorageEditor();
  useSeedList();

  const { dir, nodes } = storage;

  const paths = useMemo(() => vfs.generatePaths(dir.split("/")), [dir]);
  const router = useRouter();
  const pathname = usePathname();

  const createQueryString = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set(name, value);

      return params.toString();
    },
    [searchParams]
  );

  const [preview, setPreview] = useQueryState("preview");
  const previewfile = nodes.find((n) => n.name === preview);
  const [view, setView] = useQueryState<View>("view", "list", {
    accepted: ["list", "grid"],
  });

  const onNodeClick = (e: React.MouseEvent, file: vfs.EntityNode) => {
    if (file.type === "folder") return;
    setPreview(file.name);
  };

  const onNodeDoubleClick = (e: React.MouseEvent, file: vfs.EntityNode) => {
    const handler: (href: string) => void =
      e.metaKey || e.ctrlKey ? (l) => open(l, "_blank") : router.push;

    switch (file.type) {
      case "folder": {
        handler(
          editorlink("objects/[[...path]]", {
            path: file.path_tokens,
            document_id: state.document_id,
            basepath: state.basepath,
          })
        );
        break;
      }
      case "file": {
        handler(`?${createQueryString("preview", file.name)}`);
        break;
      }
    }
  };

  const onNodeDelete = (file: vfs.EntityNode) => {
    deleteConfirmDialog.openDialog(file);
  };

  const onNodeRename = (file: vfs.EntityNode) => {
    const newname = prompt("Rename file", file.name);
    if (!newname) return;
    storage.mv(file.name, newname);
  };

  return (
    <div className="flex flex-1 h-full">
      <aside className="relative w-full h-full">
        <div className=" w-full h-full container mx-auto p-4 overflow-y-scroll">
          <div className="my-8">
            <Tools />
          </div>
          <div className="flex items-center justify-between">
            <nav className="flex items-center space-x-2 text-sm text-muted-foreground">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link
                        href={editorlink("objects", {
                          document_id: state.document_id,
                          basepath: state.basepath,
                        })}
                      >
                        Home{" "}
                        {storage.public && (
                          <Badge
                            variant="outline"
                            className="text-xs px-1.5 text-muted-foreground"
                          >
                            Public
                          </Badge>
                        )}
                      </Link>
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
                          <BreadcrumbLink asChild>
                            <Link href={href}>{label}</Link>
                          </BreadcrumbLink>
                        </BreadcrumbItem>
                      </React.Fragment>
                    );
                  })}
                </BreadcrumbList>
              </Breadcrumb>
            </nav>
            <div className="flex space-x-2">
              <Button
                disabled={storage.loading}
                variant="outline"
                onClick={() => storage.refresh()}
              >
                {storage.loading ? (
                  <Spinner className="h-4 w-4 me-2" />
                ) : (
                  <ReloadIcon className="h-4 w-4 me-2" />
                )}
                Reload
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setView("grid")}
                className={cn(view === "grid" && "bg-muted")}
              >
                <GridIcon className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setView("list")}
                className={cn(view === "list" && "bg-muted")}
              >
                <ListIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {storage.public && (
            <div className="py-4">
              <Alert>
                <LockOpen1Icon className="w-4 h-4" />
                <AlertTitle>Public Bucket</AlertTitle>
                <AlertDescription>
                  This bucket is public and only meant for serving public files.{" "}
                  <b>DO NOT</b> upload sensitive files here.
                </AlertDescription>
              </Alert>
            </div>
          )}
          <div className="mt-4">
            {nodes.length === 0 ? (
              storage.loading ? (
                <FolderLoadingState />
              ) : (
                <FolderEmptyState />
              )
            ) : (
              <>
                {view === "grid" ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                    {nodes.map((file, index) => (
                      <EntityNodeItemComponent
                        key={index}
                        node={file}
                        view={view}
                        onClick={(e) => onNodeClick(e, file)}
                        onDoubleClick={(e) => {
                          onNodeDoubleClick(e, file);
                        }}
                        onDeleteClick={() => onNodeDelete(file)}
                        onRenameClick={() => onNodeRename(file)}
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
                      <EntityNodeItemComponent
                        key={index}
                        node={file}
                        view={view ?? "list"}
                        onClick={(e) => onNodeClick(e, file)}
                        onDoubleClick={(e) => {
                          onNodeDoubleClick(e, file);
                        }}
                        onDeleteClick={() => onNodeDelete(file)}
                        onRenameClick={() => onNodeRename(file)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <div className="absolute bottom-4 right-8 pointer-events-none flex items-end justify-end">
          <UploadsModal />
        </div>
      </aside>
      <ConfirmDeleteDialog {...deleteConfirmDialog.props} />
      {previewfile?.type === "file" && (
        <aside className="border-s">
          <FilePreviewSidebar
            file={previewfile}
            onClose={() => setPreview("")}
          />
        </aside>
      )}
    </div>
  );
}

const EntityNodeItemComponent = ({
  node,
  view,
  onDeleteClick,
  onRenameClick,
  className,
  ...props
}: {
  node: vfs.EntityNode;
  view: View;
  onDeleteClick?: () => void;
  onRenameClick?: () => void;
} & React.HtmlHTMLAttributes<HTMLDivElement>) => {
  const commonClasses =
    "group w-full h-full relative rounded-lg p-2 transition-colors select-none cursor-pointer";

  return (
    <ContextMenu modal={false}>
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
                  type={node.type === "folder" ? "folder" : node.mimetype}
                  className="w-6 h-6"
                />
              </div>
              <span className="w-full mt-2 text-sm font-medium truncate">
                {node.name}
              </span>
            </div>
          ) : (
            <>
              <span className="w-1/2 text-sm font-medium truncate">
                <MimeTypeIcon
                  type={node.type === "folder" ? "folder" : node.mimetype}
                  className="inline align-middle me-2 w-4 h-4"
                />
                {node.name}
              </span>
              <span className="w-1/4 text-sm text-muted-foreground truncate">
                {node.size ? fmt_bytes(node.size) : ""}
              </span>
              <span className="w-1/4 text-sm text-muted-foreground truncate">
                {node.modified
                  ? format(new Date(node.modified), "yyyy-MM-dd HH:mm a")
                  : ""}
              </span>
            </>
          )}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="absolute right-1 top-1 h-8 w-8 p-0 opacity-0 group-hover:opacity-100"
                onClick={(e) => e.stopPropagation()}
              >
                <DotsHorizontalIcon className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onRenameClick}>
                <InputIcon className="me-2" />
                Rename
              </DropdownMenuItem>
              {/* <DropdownMenuItem>Move</DropdownMenuItem> */}
              {/* <DropdownMenuItem>Download</DropdownMenuItem> */}
              <DropdownMenuItem onSelect={onDeleteClick}>
                <TrashIcon className="me-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {/* <ContextMenuItem>Open</ContextMenuItem> */}
        <ContextMenuItem onSelect={onRenameClick}>
          <InputIcon className="me-2" />
          Rename
        </ContextMenuItem>
        {/* <ContextMenuItem>Move</ContextMenuItem> */}
        {/* <ContextMenuItem>Download</ContextMenuItem> */}
        <ContextMenuItem onSelect={onDeleteClick}>
          <TrashIcon className="me-2" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

function FilePreviewSidebar({
  file,
  onClose,
}: {
  file: vfs.FileNode;
  onClose?: () => void;
}) {
  const createlinkDialog = useDialogState("create-sharable-link", {
    refreshkey: true,
  });

  return (
    <>
      <div className="min-w-96 w-96 h-full flex flex-col">
        <header className="flex items-center justify-start px-2 py-4 border-b gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="min-w-10"
          >
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
                <DropdownMenuItem
                  onSelect={() => {
                    window.navigator.clipboard.writeText(file.url);
                    toast("Link copied to clipboard");
                  }}
                >
                  Copy Link
                </DropdownMenuItem>
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
      <CreateViewerLinkDialog
        key={createlinkDialog.refreshkey}
        file={file}
        {...createlinkDialog.props}
      />
    </>
  );
}

function CreateFolderDialog({ ...props }: React.ComponentProps<typeof Dialog>) {
  const [name, setName] = useState("");
  const { mkdir, cd } = useStorageEditor();

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
        <form
          id="create-folder-form"
          onSubmit={(e) => {
            e.preventDefault();
            props.onOpenChange?.(false);
            mkdir(name);
          }}
        >
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input
              autoFocus
              autoComplete="off"
              name="name"
              placeholder="Folder name"
              pattern="^(?!\.\.$)(?!\.\.\.$)(?!.*\/).+$"
              title="Folder name must not contain '/'"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </form>
        <hr />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button form="create-folder-form">Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FolderEmptyState() {
  const { openFilePicker, plainFiles } = useFilePicker({ multiple: true });
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

function FolderLoadingState() {
  return (
    <div className="w-full px-4 py-16 flex flex-col items-center justify-center gap-4 border border-dashed rounded-lg">
      <Spinner className="w-8 h-8" />
      <h6 className="text-xs text-muted-foreground">Loading...</h6>
    </div>
  );
}

function UploadsModal() {
  const { tasks } = useStorageEditor();
  const [tab, setTab] = useState<"all" | "completed" | "failed">("all");

  const [open, setOpen] = useState(false);

  const filteredTasks = useMemo(() => {
    const uploads = tasks.filter(
      (task) => task.type === "upload"
    ) as StorageEditorUploadingTask[];
    switch (tab) {
      case "all":
        return uploads;
      case "completed":
        return uploads.filter((task) => task.staus === "completed");
      case "failed":
        return uploads.filter((task) => task.staus === "failed");
    }
  }, [tab, tasks]);

  useEffect(() => {
    if (tasks.length > 0) {
      setOpen(true);
    }
  }, [tasks]);

  return (
    <Collapsible
      className="w-96 border rounded-lg shadow-xl bg-background pointer-events-auto"
      open={open}
      onOpenChange={setOpen}
    >
      <header
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between px-4 py-2"
      >
        <span className="text-sm font-medium">Uploads</span>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon">
            {open ? <ChevronDownIcon /> : <ChevronUpIcon />}
          </Button>
          {/* <Button variant="ghost" size="icon">
            <Cross2Icon />
          </Button> */}
        </div>
      </header>
      <CollapsibleContent className="min-h-96 border-t">
        <Tabs
          value={tab}
          onValueChange={setTab as any}
          className="w-full h-full p-4"
        >
          <TabsList>
            <TabsTrigger value="all">All Uploads</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
            <TabsTrigger value="failed">Failed</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-col gap-2 p-4">
          {filteredTasks.map((task, index) => (
            <UploadItem key={index} {...task} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function UploadItem({ file, staus, reason, progress }: StorageEditorTask) {
  const l_type = file.name.split(".").pop();
  const l_name = file.name.replace(`.${l_type}`, "");

  return (
    <div
      data-status={staus}
      className="w-full flex items-center gap-4 data-[status='completed']:text-muted-foreground"
    >
      <div>
        {staus === "progress" && <Spinner className="w-5 h-5" />}
        {staus === "completed" && <CheckCircledIcon className="w-5 h-5" />}
        {staus === "failed" && (
          <CrossCircledIcon className="w-5 h-5 text-destructive" />
        )}
      </div>
      <div className="flex-1 flex flex-col gap-1 overflow-hidden">
        <div className="text-sm font-medium truncate">{l_name}</div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Badge
            variant="outline"
            className="uppercase rounded text-[9px] px-1 py-0.5"
          >
            {l_type}
          </Badge>
          <span className="text-xs">{fmt_bytes(file.size)}</span>
        </div>
        {reason && (
          <span
            data-status={staus}
            className="text-xs text-muted-foreground data-[status='failed']:text-destructive"
          >
            {reason}
          </span>
        )}
      </div>
    </div>
  );
}

function ConfirmDeleteDialog({
  data,
  ...props
}: {
  data?: vfs.EntityNode;
} & React.ComponentProps<typeof Dialog>) {
  const storage = useStorageEditor();

  return (
    <Dialog {...props}>
      {data && (
        <DialogContent>
          <DialogHeader className="overflow-hidden">
            <DialogTitle className="truncate">
              <ExclamationTriangleIcon className="inline align-middle me-2 w-4 h-4" />
              Delete {data.name}
            </DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogDescription>
            Are you sure you want to delete this {data.type}?
          </DialogDescription>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button
                onClick={() => storage.rm(data.key)}
                variant="destructive"
              >
                Delete
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
