import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  ExternalLinkIcon,
  InfoCircledIcon,
  FigmaLogoIcon,
  CodeIcon,
} from "@radix-ui/react-icons";
import Link from "next/link";
import iofigma from "@grida/io-figma";
const FigImporter = iofigma.kiwi.FigImporter;
import { readFigFile, getThumbnail } from "@grida/io-figma/fig-kiwi";
import { Kbd } from "@/components/ui/kbd";

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

interface FigFileImportResult {
  file: File;
  sceneCount: number;
  scenes: Array<{
    name: string;
    nodeCount: number;
  }>;
  thumbnailUrl?: string;
}

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
  onImportFig,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  onImport?: (node: FetchNodeResult) => void;
  onImportFig?: (result: FigFileImportResult) => Promise<void>;
}) {
  return (
    <Dialog {...props}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FigmaLogoIcon className="size-5" />
            Import from Figma
          </DialogTitle>
          <DialogDescription>
            Import Figma content into your Grida document
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <InfoCircledIcon />
          <AlertTitle>
            Quick Tip - You can use <Kbd>⌘C</Kbd> <Kbd>⌘V</Kbd>{" "}
          </AlertTitle>
          <AlertDescription>
            <p>
              You can also simply copy content in Figma <Kbd>⌘C</Kbd> and paste
              it directly into Grida <Kbd>⌘V</Kbd>. No file or API needed!{" "}
            </p>
            <Link
              href="/docs/editor/features/copy-paste-figma"
              target="_blank"
              className="inline-flex items-center gap-1 underline hover:opacity-70"
            >
              Learn More
              <ExternalLinkIcon className="size-3" />
            </Link>
          </AlertDescription>
        </Alert>

        <Tabs defaultValue="fig" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="fig" className="flex items-center gap-2">
              <FigmaLogoIcon className="size-4" />
              .fig File
            </TabsTrigger>
            <TabsTrigger value="api" className="flex items-center gap-2">
              <CodeIcon className="size-4" />
              API
            </TabsTrigger>
          </TabsList>

          <TabsContent value="fig" className="space-y-4 mt-4">
            <FigFileImportTab
              onImportFig={onImportFig}
              onClose={() => props.onOpenChange?.(false)}
            />
          </TabsContent>

          <TabsContent value="api" className="space-y-4 mt-4">
            <FigmaApiImportTab
              onImport={onImport}
              onClose={() => props.onOpenChange?.(false)}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function FigFileImportTab({
  onImportFig,
  onClose,
}: {
  onImportFig?: (result: FigFileImportResult) => Promise<void>;
  onClose: () => void;
}) {
  const { openFilePicker, loading, plainFiles, clear } = useFilePicker({
    accept: ".fig",
    multiple: false,
  });
  const [step, setStep] = useState<"select" | "confirm">("select");
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<FigFileImportResult | null>(null);
  const [progress, setProgress] = useState(0);

  const handleParse = useCallback(async () => {
    if (plainFiles.length === 0) return;

    setParsing(true);
    setProgress(0);

    try {
      const file = plainFiles[0];

      // Read file with progress tracking
      const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();

        reader.onprogress = (e) => {
          if (e.lengthComputable) {
            const fileProgress = Math.round((e.loaded / e.total) * 100);
            setProgress(fileProgress);
          }
        };

        reader.onload = () => {
          setProgress(100);
          resolve(reader.result as ArrayBuffer);
        };

        reader.onerror = () => reject(reader.error);

        reader.readAsArrayBuffer(file);
      });

      const fileBytes = new Uint8Array(buffer);

      // Extract thumbnail if available
      let thumbnailUrl: string | undefined;
      try {
        const figData = readFigFile(fileBytes);
        const thumbnailBytes = getThumbnail(figData.zip_files);
        if (thumbnailBytes) {
          // Convert thumbnail bytes to data URL
          const blob = new Blob([new Uint8Array(thumbnailBytes)], {
            type: "image/png",
          });
          thumbnailUrl = URL.createObjectURL(blob);
        }
      } catch (e) {
        // Thumbnail extraction is optional, continue even if it fails
        console.debug("Could not extract thumbnail:", e);
      }

      const figFile = FigImporter.parseFile(fileBytes);

      const result = {
        file,
        sceneCount: figFile.pages.length,
        scenes: figFile.pages.map((page) => ({
          name: page.name,
          nodeCount: page.rootNodes.length,
        })),
        thumbnailUrl,
      };

      setParsed(result);
      setStep("confirm");
    } catch (error) {
      toast.error("Failed to parse .fig file");
      console.error(error);
    } finally {
      setParsing(false);
    }
  }, [plainFiles]);

  // Auto-parse when file is selected
  useEffect(() => {
    if (plainFiles.length > 0 && !parsed && !parsing) {
      handleParse();
    }
  }, [plainFiles, parsed, parsing, handleParse]);

  const handleImport = async () => {
    if (!parsed || plainFiles.length === 0 || !onImportFig) return;

    const importPromise = onImportFig(parsed);

    toast.promise(importPromise, {
      loading: "Importing scenes...",
      success: `Imported ${parsed.sceneCount} scene(s)`,
      error: "Failed to import",
    });

    await importPromise;

    // Clean up thumbnail URL
    if (parsed.thumbnailUrl) {
      URL.revokeObjectURL(parsed.thumbnailUrl);
    }

    clear();
    setParsed(null);
    setStep("select");
    onClose();
  };

  // Cleanup thumbnail URL on unmount
  useEffect(() => {
    return () => {
      if (parsed?.thumbnailUrl) {
        URL.revokeObjectURL(parsed.thumbnailUrl);
      }
    };
  }, [parsed?.thumbnailUrl]);

  return (
    <>
      <div className="space-y-4">
        {step === "select" && (
          <>
            <div>
              <Label className="text-sm">Select a .fig file</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Import Figma pages as Grida scenes.{" "}
                <Link
                  href="/docs/with-figma/guides/how-to-get-fig-file"
                  target="_blank"
                  className="inline-flex items-center gap-1 underline hover:opacity-70"
                >
                  How to get a .fig file
                  <ExternalLinkIcon className="size-3" />
                </Link>
              </p>
            </div>

            <Card className="flex items-center justify-center p-0">
              <Button
                onClick={openFilePicker}
                disabled={loading || parsing}
                variant="ghost"
                className="w-full h-full p-12"
              >
                {loading || parsing ? "Processing..." : "Select .fig File"}
              </Button>
            </Card>

            {plainFiles.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm">
                  <strong>Selected:</strong> {plainFiles[0].name}
                </p>
                {parsing && <Progress value={progress} className="w-full" />}
              </div>
            )}
          </>
        )}

        {step === "confirm" && parsed && (
          <>
            <div>
              <Label className="text-sm">Confirm Import</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Review the scenes that will be imported from{" "}
                <strong>{plainFiles[0]?.name}</strong>
              </p>
            </div>

            <Card className="p-4 space-y-4">
              {parsed.thumbnailUrl && (
                <div className="flex justify-center">
                  <img
                    src={parsed.thumbnailUrl}
                    alt="File thumbnail"
                    className="max-w-full max-h-48 rounded-md border border-border object-contain"
                  />
                </div>
              )}
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  This will add {parsed.sceneCount} new scene(s) to your
                  document:
                </p>
                <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside max-h-40 overflow-y-auto">
                  {parsed.scenes.map((scene, i) => (
                    <li key={i}>
                      {scene.name} ({scene.nodeCount} node(s))
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          </>
        )}
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        {step === "confirm" && <Button onClick={handleImport}>Import</Button>}
      </DialogFooter>
    </>
  );
}

function FigmaApiImportTab({
  onImport,
  onClose,
}: {
  onImport?: (node: FetchNodeResult) => void;
  onClose: () => void;
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
        onClose();
      });

    toast.promise(pr, {
      loading: "Importing...",
      success: "Imported",
      error: "Failed to import (see console)",
    });
  };

  return (
    <>
      <form
        ref={form}
        id="import-api"
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
          <p className="text-xs text-muted-foreground">
            Tip: Press Cmd/Ctrl + L in Figma to copy the selection URL
          </p>
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
          <Label>Node ID</Label>
          <Input
            name="nodeid"
            required
            type="text"
            placeholder="123:456"
            pattern="[0-9:]+"
          />
          <p className="text-xs text-muted-foreground">
            Import any selection (frames, shapes, groups, etc.)
          </p>
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
        <Button form="import-api" type="submit">
          Import
        </Button>
      </DialogFooter>
    </>
  );
}
