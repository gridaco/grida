import {
  PlusIcon,
  EnterFullScreenIcon,
  TrashIcon,
  DotsHorizontalIcon,
  DownloadIcon,
  OpenInNewWindowIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type {
  CellIdentifier,
  DataGridCellFileRefsResolver,
  DataGridFileRef,
} from "../types";
import { useMediaViewer } from "@/components/mediaviewer";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import React, { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MediaPicker } from "@/scaffolds/mediapicker";
import { FileTypeIcon } from "@/components/form-field-type-icon";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { SignedUploadUrlData } from "@/types/private/api";
import { SupabaseStorageExtensions } from "@/lib/supabase/storage-ext";
import { Spinner } from "@/components/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { useFileRefs } from "../providers";

export function FileLoadingCell() {
  return (
    <div className="min-w-8 aspect-square py-1">
      <Skeleton className=" w-full h-full" />
    </div>
  );
}

export function FileEditCell({
  identifier,
  rowdata,
  type,
  accept,
  multiple,
  resolver,
}: {
  identifier: CellIdentifier;
  rowdata: Record<string, any> | null;
  type: "image" | "file" | "audio" | "video";
  accept?: string;
  multiple?: boolean;
  resolver?: DataGridCellFileRefsResolver;
}) {
  const refs = useFileRefs(identifier, rowdata, resolver);

  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const { open: openMediaViewer } = useMediaViewer();

  const onEnterFullScreen = (f: DataGridFileRef) => {
    switch (type) {
      case "audio":
        openMediaViewer(f, { contentType: "audio/*" });
        break;
      case "video":
        openMediaViewer(f, { contentType: "video/*" });
        break;
      case "image":
        openMediaViewer(f, { contentType: "image/*" });
      default:
        openMediaViewer(f);
        break;
    }
  };

  const canAddNewFile = multiple || (Array.isArray(refs) && refs.length === 0);

  const uploader = async (file: File | Blob) => {
    // TODO: commit the changes
    return "";
  };

  return (
    <Popover open modal>
      <PopoverTrigger asChild>
        <button className="w-full h-full max-w-sm" />
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={-44}
        className="min-w-48 w-[--radix-popover-trigger-width] max-w-sm max-h-[--radix-popover-content-available-height] p-0"
      >
        <div className="">
          <ScrollArea>
            <div className="max-h-[500px] flex flex-col gap-2">
              <FileRefsStateRenderer
                refs={refs}
                renderers={{
                  loading: <Spinner />,
                  empty: <></>,
                  error: <div>Error</div>,
                  files: (f, i) => {
                    return (
                      <FileItem
                        key={i}
                        type={type}
                        file={f}
                        accept={accept || ""}
                        onEnterFullScreen={() => onEnterFullScreen(f)}
                      />
                    );
                  },
                }}
              />
            </div>
          </ScrollArea>
          <footer className="p-2 border-t">
            <Tooltip>
              <TooltipTrigger className="w-full">
                <Button
                  disabled={!canAddNewFile}
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    toast.error("Not implemented yet - contact support");
                    // setMediaPickerOpen(true)
                  }}
                >
                  <PlusIcon className="me-2" />
                  Add File
                </Button>
              </TooltipTrigger>
              {!canAddNewFile && (
                <TooltipContent>
                  multiple is set to false, only one file is allowed.
                </TooltipContent>
              )}
            </Tooltip>
            <MediaPicker
              // uploader={uploader}
              open={mediaPickerOpen}
              onOpenChange={setMediaPickerOpen}
              onUseImage={(src) => {
                // TODO: commit the changes
                setMediaPickerOpen(false);
                toast.error("Not implemented yet - contact support");
              }}
            />
          </footer>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function FileRefsStateRenderer({
  refs,
  renderers,
}: {
  refs: DataGridFileRef[] | "loading" | null | "error";
  renderers: {
    loading?: React.ReactNode;
    error?: React.ReactNode;
    empty?: React.ReactNode;
    files: (f: DataGridFileRef, i: number) => React.ReactNode;
  };
}) {
  if (refs === "loading") {
    return renderers.loading || <Spinner />;
  }
  if (refs === "error") {
    return (
      renderers.error || (
        <span className="text-workbench-accent-red text-xs">ERROR</span>
      )
    );
  }
  if (!refs || refs.length === 0) {
    return renderers.empty || <></>;
  }
  return refs.map(renderers.files);
}

function FileItem({
  file,
  type,
  accept,
  onEnterFullScreen,
}: {
  type: "image" | "file" | "audio" | "video";
  file: DataGridFileRef;
  accept: string;
  onEnterFullScreen: () => void;
}) {
  const [replaceFileDialogOpen, setReplaceFileDialogOpen] = useState(false);

  return (
    <div
      //
      className="flex items-start hover:bg-secondary rounded-sm"
    >
      {/* TODO: dnd & sort */}
      {/* <Button variant="ghost" size="icon" className="cursor-move">
                  <DragHandleDots2Icon />
                </Button> */}
      <div className="w-4" />
      <FileCard type={type} onEnterFullScreen={onEnterFullScreen} {...file} />

      <AlertDialog>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <DotsHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-40">
            <DropdownMenuItem
              onSelect={() => {
                onEnterFullScreen();
              }}
            >
              <EnterFullScreenIcon className="size-3.5" />
              Full Screen
            </DropdownMenuItem>
            <a href={file.download} target="_blank" rel="noreferrer" download>
              <DropdownMenuItem>
                <DownloadIcon className="size-3.5" />
                Download
              </DropdownMenuItem>
            </a>
            <a href={file.srcset.original} target="_blank" rel="noreferrer">
              <DropdownMenuItem>
                <OpenInNewWindowIcon className="size-3.5" />
                View Original
              </DropdownMenuItem>
            </a>
            {file.upsert && (
              <DropdownMenuItem onClick={() => setReplaceFileDialogOpen(true)}>
                <ReloadIcon className="size-3.5" />
                Replace
              </DropdownMenuItem>
            )}
            {/* <DropdownMenuItem>
                        <AlertDialogTrigger asChild>
                          <button>
                            <TrashIcon className="inline me-2" />
                            Delete
                          </button>
                        </AlertDialogTrigger>
                      </DropdownMenuItem> */}
          </DropdownMenuContent>
        </DropdownMenu>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Are you sure you want to delete this file?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
            >
              <TrashIcon className="inline me-2" />
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ReplaceFileDialog
        f={file}
        accept={accept}
        open={replaceFileDialogOpen}
        onOpenChange={setReplaceFileDialogOpen}
      />
    </div>
  );
}

function FileCard(props: {
  type: "image" | "file" | "audio" | "video";
  src: string;
  srcset: {
    thumbnail: string;
    original: string;
  };
  download: string;
  name: string;
  onEnterFullScreen?: () => void;
}) {
  //

  const { type, onEnterFullScreen, ...f } = props;

  switch (type) {
    case "image":
      return (
        <>
          <figure
            className="flex-1 cursor-zoom-in  py-4"
            onClick={onEnterFullScreen}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={f.src}
              alt={f.name}
              className="w-full h-full object-fit"
            />
            <figcaption className="py-2 text-xs text-muted-foreground">
              <a
                href={f.download}
                target="_blank"
                rel="noreferrer"
                download
                className="hover:underline"
              >
                <DownloadIcon className="inline align-middle me-1" />
                {f.name}
              </a>
            </figcaption>
          </figure>
        </>
      );
    default:
      return (
        <div className="flex-1 flex h-10 items-center ">
          <a
            href={f.download}
            target="_blank"
            rel="noreferrer"
            download
            className="hover:underline"
          >
            <span className="cursor-pointer hover:underline text-sm">
              <FileTypeIcon
                type={type}
                className="inline w-4 h-4 align-middle me-2"
              />
              {f.name}
            </span>
          </a>
        </div>
      );
  }
}

function ReplaceFileDialog({
  f,
  accept,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  f: DataGridFileRef;
  accept?: string;
}) {
  const [file, setFile] = useState<File | undefined>();
  const [uploading, setUploading] = useState(false);

  const onReplaceClick = async () => {
    if (!file) {
      toast.error("Please select a file to replace.");
      return;
    }
    if (!f.upsert) {
      toast.error("Replace is not supported for this file");
      return;
    }

    setUploading(true);
    fetch(f.upsert!, {
      method: "PUT",
    }).then((res) => {
      res
        .json()
        .then(({ data }) => {
          if (data) {
            const { signedUrl } = data as SignedUploadUrlData;

            //
            SupabaseStorageExtensions.uploadToSupabaseS3SignedUrl(
              signedUrl,
              file
            )
              .then(({ data, error }) => {
                if (error || !data) {
                  toast.error("Failed to replace file.");
                  return;
                }
                toast.success(
                  "File replaced successfully. (refresh to see changes)"
                );
              })
              .finally(() => {
                setUploading(false);
              });
          } else {
            toast.error("Please try again later.");
          }
        })
        .catch(() => {
          setUploading(false);
        });
    });
  };

  return (
    <Dialog {...props}>
      <DialogContent>
        <div>
          <input
            type="file"
            multiple={false}
            accept={accept}
            onChange={(e) => {
              setFile(e.target.files?.[0]);
            }}
          />
        </div>
        <Button disabled={!file || uploading} onClick={onReplaceClick}>
          {uploading ? (
            <>
              <Spinner />
            </>
          ) : (
            <>Replace</>
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
