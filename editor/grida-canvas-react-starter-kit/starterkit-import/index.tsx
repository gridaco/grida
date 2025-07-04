import React, { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import * as Figma from "figma-api";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useFilePicker } from "use-file-picker";
import { Card } from "@/components/ui/card";
import { io } from "@grida/io";

export function ImportFromGridaFileJsonDialog({
  onImport,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  onImport?: (document: io.LoadedDocument) => void;
}) {
  const { openFilePicker, loading, plainFiles } = useFilePicker({
    accept: ".grida,.json",
    multiple: false,
  });

  const handleFileImport = async () => {
    if (plainFiles.length > 0) {
      try {
        const f = plainFiles[0];
        const doc = await io.load(f);
        onImport?.(doc);
        toast.success("File successfully imported!");
        props.onOpenChange?.(false); // Close the dialog
      } catch (error) {
        toast.error("Failed to parse the file. Please check the format.");
        console.error(error);
      }
    } else {
      toast.error("No file selected.");
    }
  };

  return (
    <Dialog {...props}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import from .grida File</DialogTitle>
          <DialogDescription>
            Import a document from a .grida or .json file.
            <br />
            <small>Supported file formats: .grida, .json</small>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Label>Select a .grida file</Label>
          <Card className="flex items-center justify-center p-0">
            <Button
              onClick={openFilePicker}
              disabled={loading}
              variant="ghost"
              className="w-full h-full p-10 "
            >
              {loading ? "Loading..." : "Select File"}
            </Button>
          </Card>
          {plainFiles.length > 0 && (
            <p>
              <small>Selected File: {plainFiles[0].name}</small>
            </p>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
          <Button
            type="button"
            onClick={handleFileImport}
            disabled={plainFiles.length === 0}
          >
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

async function fetchnode({
  filekey,
  id,
  personalAccessToken,
}: {
  filekey: string;
  id: string;
  personalAccessToken: string;
}) {
  const client = new Figma.Api({ personalAccessToken: personalAccessToken });
  const imagesres = await client.getImageFills({ file_key: filekey });
  const images = imagesres.meta.images;
  const result = await client.getFileNodes(
    { file_key: filekey },
    { ids: id, geometry: "paths" }
  );
  const nodepartialdoc = result.nodes[id];
  return { ...nodepartialdoc, images };
}

export type FetchNodeResult = Awaited<ReturnType<typeof fetchnode>>;

function normalize_node_id(nodeid: string) {
  return nodeid.replace("-", ":");
}

function useSessionStorage(key: string) {
  const [state, setState] = React.useState<string | null>(null);

  useEffect(() => {
    const value = sessionStorage.getItem(key);
    setState(value);
  }, [key]);

  const set = React.useCallback(
    (value: any) => {
      setState(value);
      sessionStorage.setItem(key, value);
    },
    [key]
  );
  return [state, set] as const;
}

export function ImportFromFigmaDialog({
  onImport,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  onImport?: (node: FetchNodeResult) => void;
}) {
  const form = useRef<HTMLFormElement>(null);

  const [token, setToken] = useSessionStorage("figma-token");
  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const form = e.currentTarget as HTMLFormElement;
    const filekey = form.filekey.value;
    const nodeid = form.nodeid.value;
    const token = form.token.value;

    const pr = fetchnode({
      filekey,
      id: nodeid,
      personalAccessToken: token,
    })
      .then((r) => {
        onImport?.(r);
      })
      .catch((e) => {
        console.error(e);
        throw e;
      })
      .finally(() => {
        props.onOpenChange?.(false);
      });

    toast.promise(pr, {
      loading: "Importing...",
      success: "Imported",
      error: "Failed to import (see console)",
    });
  };

  return (
    <Dialog {...props}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Frame from Figma</DialogTitle>
          <DialogDescription>
            Import a frame from Figma to the current document
            <br />
            <code>
              <small>
                https://www.figma.com/:file_type/:file_key/:file_name?node-id:node_id
              </small>
            </code>
          </DialogDescription>
        </DialogHeader>

        <form
          ref={form}
          id="import"
          onSubmit={onSubmit}
          className="flex flex-col gap-4"
        >
          <div className="grid gap-2">
            <Label>Import from Node URL</Label>
            <Input
              type="url"
              placeholder="https://www.figma.com/design/xxxxx/xxxx?node-id=123-456"
              onChange={(e) => {
                try {
                  const url = new URL(e.target.value);
                  const filekey = url.pathname.split("/")[2];
                  const nodeid = normalize_node_id(
                    url.searchParams.get("node-id") as string
                  );
                  form.current!.filekey.value = filekey;
                  form.current!.nodeid.value = nodeid;
                } catch (e) {}
              }}
            />
          </div>
          <hr />
          <div className="grid gap-2">
            <Label>File Key</Label>
            <Input
              name="filekey"
              required
              type="text"
              placeholder="xxxxxxxxxxxxxxxxxxxxxx"
            />
          </div>
          <div className="grid gap-2">
            <Label>Node ID - only Frame</Label>
            <Input
              name="nodeid"
              required
              type="text"
              placeholder="123:456"
              // accept numbers and ':'
              pattern="[0-9:]+"
            />
          </div>
          <div className="grid gap-2">
            <Label>Personal Access Token</Label>
            <Input
              name="token"
              required
              type="password"
              value={token ?? ""}
              onChange={(e) => setToken(e.target.value)}
              placeholder="figd_xxxxxxxxxxxx"
            />
          </div>
        </form>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
          <Button form="import" type="submit">
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
