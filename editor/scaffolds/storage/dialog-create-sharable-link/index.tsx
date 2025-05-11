"use client";
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
} from "@/components/ui-editor/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { wellkown } from "@/utils/mimetype";
import { useStorageEditor } from "../core";
import { Safari, SafariToolbar } from "@/components/frames/safari";
import { Label } from "@/components/ui/label";
import { Cross2Icon, Link2Icon } from "@radix-ui/react-icons";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Input } from "@/components/ui/input";
import { BookIcon } from "lucide-react";
import { FilePicker } from "@/components/picker";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { vfs } from "@/lib/vfs";
import { useDebounce } from "@uidotdev/usehooks";

function ImageResourcePicker({
  value,
  onValueChange,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
}) {
  const { root, list, loading } = useStorageEditor();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 truncate overflow-hidden">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              className="w-5 h-5 rounded-full object-contain"
              alt=""
            />
          ) : (
            "Select"
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="left"
        sideOffset={16}
        className="p-0 w-full border-none"
      >
        <FilePicker
          accept="image/*"
          list={list}
          nodes={root}
          loading={loading}
          onValueCommit={(files) => {
            const key = files[0].key;
            onValueChange?.(key);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

type ViewerOptions = {
  mimetype: string;
  object: string;
  title?: string;
  logo?: string;
} & (
  | {
      type: "pdf";
      app: "none" | "page-flip";
    }
  | {
      type: "image";
      app: "none";
    }
  | {
      type: "audio";
      app: "none";
    }
);

type Viewer = ViewerOptions & {
  url: string;
};

const viewer_pdf_options = [
  { value: "none", label: "Plain", Icon: Link2Icon },
  { value: "page-flip", label: "Book", Icon: BookIcon },
] as const;

function initial_viewer(file: vfs.FileNode): Viewer | undefined {
  const known = wellkown(file.mimetype);
  switch (known) {
    case "pdf":
      return {
        type: "pdf",
        mimetype: file.mimetype,
        app: "none",
        object: file.url,
        url: file.url,
      };
    case "image":
      return {
        type: "image",
        mimetype: file.mimetype,
        app: "none",
        object: file.url,
        url: file.url,
      };
    case "audio":
      return {
        type: "audio",
        mimetype: file.mimetype,
        app: "none",
        object: file.url,
        url: file.url,
      };
  }
  return undefined;
}

function create_viewer(prev: Viewer, options: Partial<ViewerOptions>): Viewer {
  const next = { ...prev, ...options } as Viewer;
  const url = viewerlink(next);
  return { ...next, url };
}

function removeEmpty<T extends Record<string, any>>(obj: T): Partial<T> {
  return Object.entries(obj)
    .filter(
      ([, value]) => value !== undefined && value !== null && value !== ""
    )
    .reduce((acc, [key, value]) => {
      // @ts-ignore
      acc[key] = value;
      return acc;
    }, {} as Partial<T>);
}

function viewerobj(objecturl: string): string {
  const REPLACE = process.env.NEXT_PUBLIC_SUPABASE_URL + "/storage/v1/";
  const viewer_object = objecturl.replace(REPLACE, "");
  return viewer_object;
}

function viewerlink(
  viewer: ViewerOptions,
  baseUrl = "https://viewer.grida.co/v1"
  // baseUrl = "http://localhost:3001/v1"
): string {
  const params = {
    object: viewerobj(viewer.object),
    logo: viewer.logo ? viewerobj(viewer.logo) : undefined,
    app: viewer.app,
    title: viewer.title,
  };

  const qs = new URLSearchParams(removeEmpty(params)).toString();
  return `${baseUrl}/${viewer.type}?${qs}`;
}

function ViewerBody({ viewer }: { viewer: Viewer }) {
  const is_plain = viewer.app === "none";
  if (is_plain) {
    return (
      <object
        data={viewer.object}
        type={viewer.mimetype}
        width="100%"
        height="100%"
      />
    );
  } else {
    return <iframe src={viewer.url} width="100%" height="100%" />;
  }
}

export default function CreateViewerLinkDialog({
  file,
  ...props
}: React.ComponentProps<typeof Dialog> & { file: vfs.FileNode }) {
  const { getPublicUrl } = useStorageEditor();
  const [_viewer, setViewer] = useState<Viewer | undefined>(
    initial_viewer(file)
  );

  const viewer = useDebounce(_viewer, 500);

  const Body = () => {
    switch (viewer?.type) {
      case "pdf": {
        return <ViewerBody viewer={viewer} />;
      }
      case undefined:
        return (
          <div>
            <p>Viewer not available for this file type {file.mimetype}</p>
          </div>
        );
      default: {
        return (
          <div>
            <p>Viewer not available for {viewer?.type}</p>
          </div>
        );
      }
    }
  };

  return (
    <Dialog {...props}>
      <DialogContent
        className="flex flex-col max-w-none min-h-screen !rounded-none p-4"
        hideCloseButton
      >
        <DialogHeader className="flex flex-row justify-between">
          <div>
            <DialogClose asChild>
              <Button variant="ghost" size="sm">
                <Cross2Icon className="me-2" />
                Cancel
              </Button>
            </DialogClose>
          </div>
          <div></div>
          <div>
            <Button
              size="sm"
              disabled={!viewer}
              onClick={() => {
                window.navigator.clipboard.writeText(viewer!.url);
                toast("Link copied to clipboard");
              }}
            >
              Copy Link
            </Button>
          </div>
        </DialogHeader>
        <div className="w-full flex-1 flex gap-5">
          <aside className="flex-1">
            <Safari className="shadow-xl flex flex-col">
              <SafariToolbar mode="simple" url={viewer?.url} />
              <div className="flex-1 overflow-auto">
                <Body />
              </div>
            </Safari>
          </aside>
          <aside className="w-64 grid gap-2 h-min">
            <Label className="text-lg font-semibold my-4">
              Settings{" "}
              {viewer && (
                <Badge variant="outline" className="ms-2">
                  {viewer.type}
                </Badge>
              )}
            </Label>
            <div className="grid gap-5">
              <div className="grid gap-2">
                <Label className="text-xs text-muted-foreground">Viewer</Label>
                <ToggleGroup
                  type="single"
                  value={_viewer?.app}
                  className="justify-start"
                  onValueChange={(app) => {
                    setViewer((v) => create_viewer(v!, { app: app as any }));
                  }}
                >
                  {viewer_pdf_options.map((option, index) => (
                    <ToggleGroupItem key={option.value} value={option.value}>
                      <option.Icon className="me-2 w-4 aspect-square" />
                      {option.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
              <div className="grid gap-2">
                <Label className="text-xs text-muted-foreground">Title</Label>
                <Input
                  value={_viewer?.title}
                  onChange={(e) => {
                    const title = e.target.value;
                    setViewer((v) => create_viewer(v!, { title }));
                  }}
                  placeholder="Custom Title"
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-xs text-muted-foreground">Logo</Label>
                <p className="text-xs text-muted-foreground">
                  Logos may not appear in all viewers.
                </p>
                <ImageResourcePicker
                  value={_viewer?.logo}
                  onValueChange={(logo) => {
                    const logourl = getPublicUrl(logo);
                    setViewer((v) => create_viewer(v!, { logo: logourl }));
                  }}
                />
              </div>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
