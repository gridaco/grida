import { saveAs } from "file-saver";
import { Button } from "@/components/ui-editor/button";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CodeIcon, QuestionMarkCircledIcon } from "@radix-ui/react-icons";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { exportWithP666 } from "@/grida-canvas-plugin-p666";
import { exportAsImage } from "@/grida-canvas/backends/dom-export";
import { useCurrentEditor } from "@/grida-canvas-react";

const mimes = {
  PNG: "image/png",
  JPEG: "image/jpeg",
  PDF: "application/pdf",
  SVG: "image/svg+xml",
} as const;

export function ExportNodeControl({
  node_id,
  name,
  disabled,
}: {
  node_id: string;
  name: string;
  disabled?: boolean;
}) {
  const editor = useCurrentEditor();
  const advancedExportDialog = useDialogState("advenced-export", {
    refreshkey: true,
  });

  const exportHandler = (
    dataPromise: Promise<Uint8Array | string | false>,
    format: "SVG" | "PDF" | "PNG" | "JPEG"
  ): Promise<Blob> => {
    return new Promise<Blob>(async (resolve, reject) => {
      try {
        const data = await dataPromise;

        if (!data) {
          reject(new Error("Failed to export"));
          return;
        }

        const blob = new Blob([data as BlobPart], { type: mimes[format] });
        resolve(blob);
      } catch (e) {
        reject(e);
      }
    });
  };

  const onExport = async (format: "SVG" | "PDF" | "PNG" | "JPEG") => {
    let task: Promise<Blob>;

    switch (format) {
      case "JPEG":
      case "PNG":
        task = exportHandler(editor.exportNodeAs(node_id, format), format);
        break;
      case "PDF":
        task = exportHandler(editor.exportNodeAs(node_id, format), format);
        break;
      case "SVG":
        task = exportHandler(editor.exportNodeAs(node_id, format), format);
        break;
    }

    if (task) {
      toast.promise(task, {
        loading: "Exporting...",
        success: "Exported",
        error: "Failed to export",
      });

      task.then((blob) => {
        saveAs(blob, `${name}.${format.toLowerCase()}`);
      });
    } else {
      toast.error("Export is not supported yet");
    }
  };

  return (
    <>
      {editor.backend === "dom" && (
        <AdvancedExportDialog
          {...advancedExportDialog.props}
          key={advancedExportDialog.refreshkey}
          defaultName={name}
          node_id={node_id}
        />
      )}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            disabled={disabled}
            variant="outline"
            size="xs"
            className="w-full overflow-hidden"
          >
            <span className="text-ellipsis overflow-hidden">Export as ...</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="left" align="start" collisionPadding={16}>
          {editor.backend === "dom" && (
            <>
              <DropdownMenuLabel>
                <Badge variant="outline" className="text-xs">
                  BETA
                </Badge>
                <br />
                <div className="w-40">
                  <small className="leading-tight font-normal text-muted-foreground">
                    &quot;Export as&quot; is currently in beta and may produce
                    inconsistent outputs.
                  </small>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          )}

          <DropdownMenuItem
            className="text-xs"
            onSelect={() => onExport("PNG")}
          >
            PNG
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-xs"
            onSelect={() => onExport("JPEG")}
          >
            JPEG
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-xs"
            onSelect={() => onExport("SVG")}
          >
            SVG
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-xs"
            onSelect={() => onExport("PDF")}
          >
            PDF
          </DropdownMenuItem>
          {editor.backend === "dom" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-xs"
                onSelect={advancedExportDialog.openDialog}
              >
                <CodeIcon className="size-3.5" />
                Advanced
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

function AdvancedExportDialog({
  node_id,
  defaultName,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  node_id: string;
  defaultName: string;
}) {
  const [backend, setBackend] = React.useState<"canvas" | "p666">("canvas");
  const [format, setFormat] = React.useState<"PNG" | "SVG" | "JPEG" | "PDF">(
    "PNG"
  );
  const [name, setName] = React.useState<string>(defaultName);
  const [xpath, setXPath] = React.useState<string>("");

  const options = {
    canvas: ["PNG", "SVG", "JPEG"],
    p666: ["PNG", "PDF"],
  };

  const onExport = async () => {
    switch (format) {
      case "PNG":
      case "JPEG":
      case "SVG":
        {
          const result = await exportAsImage(node_id, format);
          if (!result) {
            toast.error("Failed to export");
            return;
          }
          await fetch(result.url)
            .then((res) => res.blob())
            .then((blob) => {
              saveAs(blob, `${name}.${format}`);
            });
        }
        break;
      case "PDF":
        const task = exportWithP666(node_id, format).then((blob) => {
          saveAs(blob, `${name}.${format}`);
        });

        toast.promise(task, {
          loading: "Exporting...",
          success: "Exported",
          error: "Failed to export",
        });
        break;
    }
  };

  return (
    <Dialog modal={false} {...props}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Advanced Export</DialogTitle>
          <DialogDescription>
            Export node with advanced options
          </DialogDescription>
        </DialogHeader>
        <hr />
        <div className="grid gap-8 my-4">
          <div className="grid gap-2">
            <Label>Mode</Label>
            <ToggleGroup
              type="single"
              value={backend}
              onValueChange={(v) => v && setBackend(v as any)}
              className="w-min"
            >
              <ToggleGroupItem value="canvas">Canvas</ToggleGroupItem>
              <ToggleGroupItem value="p666">Daemon</ToggleGroupItem>
            </ToggleGroup>
            {backend === "p666" && (
              <div className="text-xs">
                To use daemon, run{" "}
                <Link
                  href="https://github.com/gridaco/puppeteer-666"
                  target="_blank"
                >
                  p666
                </Link>{" "}
                on your machine
                <br />
                <code>{">"} npx p666</code>
              </div>
            )}
          </div>
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input
              placeholder="filename"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Format</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as any)}>
              <SelectTrigger>
                <SelectValue placeholder="format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  value="PNG"
                  disabled={!options[backend].includes("PNG")}
                >
                  PNG
                </SelectItem>
                <SelectItem
                  value="SVG"
                  disabled={!options[backend].includes("SVG")}
                >
                  SVG
                </SelectItem>
                <SelectItem
                  value="PDF"
                  disabled={!options[backend].includes("PDF")}
                >
                  PDF
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Filter</Label>
            <Collapsible>
              <CollapsibleTrigger>
                <small>
                  <QuestionMarkCircledIcon className="size-3 me-2 inline" />
                  Learn More About Grida XPath
                </small>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <GridaXPathHelpArticle />
              </CollapsibleContent>
            </Collapsible>
            <Select
              value={xpath || undefined}
              onValueChange={(v) => setXPath(v)}
              disabled={backend === "p666"}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose preset" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="//*[not(@data-grida-node-type='text')]">
                  Exclude Text
                </SelectItem>
                {/* TODO: inspect me */}
                <SelectItem value="//*[not(@data-grida-node-type='image')]">
                  Exclude Image
                </SelectItem>
              </SelectContent>
            </Select>
            <Textarea
              placeholder="e.g. //*[not(@data-grida-node-type='text')]"
              value={xpath}
              disabled={backend === "p666"}
              onChange={(e) => setXPath(e.target.value)}
            />
          </div>
        </div>
        <hr />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button onClick={onExport}>Export</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GridaXPathHelpArticle() {
  return (
    <article className="prose prose-sm dark:prose-invert">
      <p>
        Use an XPath query to filter elements in the export process. You can
        target specific elements based on their attributes, such as:
      </p>
      <ul>
        <li>
          <code>data-grida-node-id</code>: The unique identifier for each node.
        </li>
        <li>
          <code>data-grida-node-locked</code>: Indicates whether the node is
          locked.
        </li>
        <li>
          <code>data-grida-node-type</code>: Specifies the type of node (e.g.,
          text, image, container).
        </li>
      </ul>
      <p>Examples:</p>
      <ul>
        <li>
          Exclude nodes with a specific ID:
          <code>//*[@data-grida-node-id='node123']</code>
        </li>
        <li>
          Exclude all locked nodes:
          <code>//*[@data-grida-node-locked='true']</code>
        </li>
        <li>
          Exclude all nodes of a certain type (e.g., images):
          <code>//*[@data-grida-node-type='image']</code>
        </li>
      </ul>
    </article>
  );
}
