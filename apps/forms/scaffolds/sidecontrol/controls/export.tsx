import { toPng, toSvg } from "html-to-image";
import type { Options } from "html-to-image/lib/types";
import { saveAs } from "file-saver";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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

export function exportAs(
  node_id: string,
  format: "svg" | "png",
  {
    filename = `image.${format}`,
    xpath,
    htmlToImageOptions = {},
  }: {
    filename?: string;
    xpath?: string;
    htmlToImageOptions?: Partial<Options>;
  }
) {
  const domnode = document.getElementById(node_id);

  if (!domnode) {
    toast.error("Node not found");
    return;
  }

  // Generate a filter function based on XPath
  let filter: Options["filter"];
  if (xpath?.trim()) {
    try {
      const xpathResult = document.evaluate(
        xpath,
        domnode,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );

      const excludedNodes = new Set<HTMLElement>();
      for (let i = 0; i < xpathResult.snapshotLength; i++) {
        const node = xpathResult.snapshotItem(i) as HTMLElement;
        if (node) excludedNodes.add(node);
      }

      // Exclude nodes that match the XPath query
      filter = (domNode) => excludedNodes.has(domNode as HTMLElement);
    } catch (error) {
      toast.error("Invalid XPath");
      return;
    }
  }

  // Prepare the options for html-to-image
  const options: Options = {
    ...htmlToImageOptions,
    filter,
  };

  // Select the correct export function
  const generateImage = format === "png" ? toPng : toSvg;

  // Export the image
  const task = generateImage(domnode, options).then((dataUrl) => {
    // Convert data URL to Blob and trigger download
    fetch(dataUrl)
      .then((res) => res.blob())
      .then((blob) => saveAs(blob, filename));
  });

  toast.promise(task, {
    loading: "Exporting...",
    success: "Exported",
    error: "Failed to export",
  });
}

export function ExportNodeWithHtmlToImage({
  node_id,
  name,
}: {
  node_id: string;
  name: string;
}) {
  const advancedExportDialog = useDialogState("advenced-export", {
    refreshkey: true,
  });

  const onExport = (format: "svg" | "png") => {
    exportAs(node_id, format, { filename: `${name}.${format}` });
  };

  return (
    <>
      <AdvancedExportDialog
        {...advancedExportDialog}
        key={advancedExportDialog.refreshkey}
        defaultName={name}
        node_id={node_id}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="xs"
            className="w-full overflow-hidden"
          >
            <span className="text-ellipsis overflow-hidden">Export as ...</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="left" align="start">
          <DropdownMenuItem onSelect={() => onExport("png")}>
            PNG
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onExport("svg")}>
            SVG
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={advancedExportDialog.openDialog}>
            <CodeIcon className="me-2" />
            Advanced
          </DropdownMenuItem>
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
  const [format, setFormat] = React.useState<"png" | "svg">("png");
  const [filename, setName] = React.useState<string>(
    defaultName + "." + format
  );
  const [xpath, setXPath] = React.useState<string>("");

  const onExport = () => {
    exportAs(node_id, format, { filename: filename, xpath });
  };

  return (
    <Dialog {...props}>
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
            <Label>Name</Label>
            <Input
              placeholder="filename"
              value={filename}
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
                <SelectItem value="png">png</SelectItem>
                <SelectItem value="svg">svg</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>XPath Filter</Label>
            <Collapsible>
              <CollapsibleTrigger>
                <small>
                  <QuestionMarkCircledIcon className="w-3 h-3 me-2 inline" />
                  Learn More About Grida XPath
                </small>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <GridaXPathHelpArticle />
              </CollapsibleContent>
            </Collapsible>
            <Textarea
              placeholder="e.g. //*[not(@data-grida-node-type='text')]"
              value={xpath}
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
