import React, { useEffect, useRef } from "react";
import * as Figma from "figma-api";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
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
import { FigmaLogoIcon } from "@radix-ui/react-icons";
import { toast } from "sonner";

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

/**
 * @param nodeid - url encoded node id, "123-456" -> "123:456"
 */
function normalize_node_id(nodeid: string) {
  return nodeid.replaceAll("-", ":");
}

function useSessionStorage(key: string) {
  const [state, setState] = React.useState<string | null>(null);

  useEffect(() => {
    const value = sessionStorage.getItem(key);
    setState(value);
  }, [key]);

  const set = React.useCallback(
    (value: string | null) => {
      setState(value);
      if (value !== null) {
        sessionStorage.setItem(key, value);
      }
    },
    [key]
  );
  return [state, set] as const;
}

/**
 * Import dialog for Figma content via the REST API.
 *
 * Requires a personal access token and a file key + node id (or a full
 * Figma selection URL that the dialog will parse).
 */
export function ImportFromFigmaApiDialog({
  onImport,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  onImport?: (node: FetchNodeResult) => void | Promise<void>;
}) {
  const close = () => props.onOpenChange?.(false);
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
      .then(async (r) => {
        await onImport?.(r);
      })
      .catch((e) => {
        console.error(e);
        throw e;
      })
      .finally(close);

    toast.promise(pr, {
      loading: "Importing...",
      success: "Imported",
      error: "Failed to import (see console)",
    });
  };

  return (
    <Dialog {...props}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FigmaLogoIcon className="size-5" />
            Import from Figma (API)
          </DialogTitle>
          <DialogDescription>
            Import a Figma selection via the Figma REST API
          </DialogDescription>
        </DialogHeader>

        <form
          ref={form}
          id="import-figma-api"
          onSubmit={onSubmit}
          className="flex flex-col gap-4"
        >
          <Field>
            <FieldLabel>Import from Node URL</FieldLabel>
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
                } catch {}
              }}
            />
            <FieldDescription className="text-xs text-muted-foreground">
              Tip: Press Cmd/Ctrl + L in Figma to copy the selection URL
            </FieldDescription>
          </Field>
          <hr />
          <Field>
            <FieldLabel>File Key</FieldLabel>
            <Input
              name="filekey"
              required
              type="text"
              placeholder="xxxxxxxxxxxxxxxxxxxxxx"
            />
          </Field>
          <Field>
            <FieldLabel>Node ID</FieldLabel>
            <Input
              name="nodeid"
              required
              type="text"
              placeholder="123:456"
              pattern="[0-9:]+"
            />
            <FieldDescription className="text-xs text-muted-foreground">
              Import any selection (frames, shapes, groups, etc.)
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Personal Access Token</FieldLabel>
            <Input
              name="token"
              required
              type="password"
              value={token ?? ""}
              onChange={(e) => setToken(e.target.value)}
              placeholder="figd_xxxxxxxxxxxx"
            />
          </Field>
        </form>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
          <Button form="import-figma-api" type="submit">
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
