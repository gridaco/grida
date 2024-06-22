import {
  PlusIcon,
  ChevronDownIcon,
  EnterFullScreenIcon,
  Link2Icon,
  Pencil1Icon,
  TrashIcon,
  DotsHorizontalIcon,
  DownloadIcon,
  FileIcon,
  DragHandleDots1Icon,
  DragHandleDots2Icon,
  UploadIcon,
  ReloadIcon,
  OpenInNewWindowIcon,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { GFFile } from "./types";
import { useMediaViewer } from "../mediaviewer";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState } from "react";

export function FileEditCell({
  accept,
  multiple,
  files,
}: {
  accept?: string;
  multiple?: boolean;
  files: {
    src: string;
    srcset: {
      thumbnail: string;
      original: string;
    };
    download: string;
    name: string;
  }[];
}) {
  const { open: openMediaViewer } = useMediaViewer();

  const onEnterFullScreen = (f: GFFile) => {
    openMediaViewer(f, "image/*");
  };

  const canAddNewFile = multiple || files?.length === 0;

  return (
    <Popover open>
      <PopoverTrigger asChild>
        <button className="w-full h-full" />
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={-44}
        className="min-w-[--radix-popover-trigger-width] max-w-sm max-h-[--radix-popover-content-available-height] p-0"
      >
        <div>
          <div className="flex flex-col gap-2">
            {files?.map((f, i) => (
              <div
                //
                className="flex items-start hover:bg-secondary rounded "
                key={i}
              >
                {/* TODO: dnd & sort */}
                {/* <Button variant="ghost" size="icon" className="cursor-move">
                  <DragHandleDots2Icon />
                </Button> */}
                <div className="w-4" />
                <figure
                  className="flex-1 cursor-zoom-in"
                  onClick={() => onEnterFullScreen(f)}
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
                <AlertDialog>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <DotsHorizontalIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="min-w-40">
                      <DropdownMenuItem
                        onSelect={() => {
                          onEnterFullScreen(f);
                        }}
                      >
                        <EnterFullScreenIcon className="me-2" />
                        Full Screen
                      </DropdownMenuItem>
                      <a
                        href={f.download}
                        target="_blank"
                        rel="noreferrer"
                        download
                      >
                        <DropdownMenuItem>
                          <DownloadIcon className="me-2" />
                          Download
                        </DropdownMenuItem>
                      </a>
                      <a
                        href={f.srcset.original}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <DropdownMenuItem>
                          <OpenInNewWindowIcon className="me-2" />
                          View Original
                        </DropdownMenuItem>
                      </a>
                      {/* <DropdownMenuItem>
                        <ReloadIcon className="me-2" />
                        Replace
                      </DropdownMenuItem>
                      <DropdownMenuItem>
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
              </div>
            ))}
          </div>
          <footer className="p-2 border-t">
            <Popover>
              <PopoverTrigger asChild>
                <Tooltip>
                  <TooltipTrigger className="w-full">
                    <Button
                      disabled={!canAddNewFile}
                      variant="outline"
                      size="sm"
                      className="w-full"
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
              </PopoverTrigger>
              <PopoverContent>upload here</PopoverContent>
            </Popover>
          </footer>
        </div>
      </PopoverContent>
    </Popover>
  );
}
