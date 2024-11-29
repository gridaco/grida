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

function exportAsImage(
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
    skipFonts: true,
    preferredFontFormat: "woff2",
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

/**
 * @see https://github.com/gridaco/puppeteer-666
 */
function checkP666(): Promise<boolean> {
  return fetch("http://localhost:666", {
    method: "GET",
  })
    .then(() => {
      return true;
    })
    .catch(() => {
      return false;
    });
}

/**
 * @see https://github.com/gridaco/puppeteer-666
 */
async function exportWithP666(
  node_id: string,
  format: "png" | "pdf",
  {
    filename = `image.${format}`,
    // xpath,
  }: {
    filename?: string;
    // xpath?: string;
  }
) {
  const daemonok = await checkP666();
  if (!daemonok) {
    console.error(
      "Daemon is not running on port 666. @see https://github.com/gridaco/puppeteer-666"
    );
    toast.error("Daemon is not running on port 666");
    return;
  }

  const domnode = document.getElementById(node_id);
  const html = domnode!.outerHTML;

  let requrl = "";
  switch (format) {
    case "pdf":
      requrl = "http://localhost:666/api/pdf";
      break;
    case "png":
      requrl = "http://localhost:666/api/screenshoot";
      break;
  }

  // this will return pdf/png file (if the daemon is running)
  const task = fetch(requrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      html,
      options: {
        width: domnode!.clientWidth,
        height: domnode!.clientHeight,
      },
    }),
  }).then((res) => {
    res.blob().then((blob) => {
      saveAs(blob, filename);
    });
  });

  toast.promise(task, {
    loading: "Exporting...",
    success: "Exported",
    error: "Failed to export",
  });
}

/**
 * exports node as archive - used for testing and custom rendering. e.g. PDF, PPTX.
 * TODO:
 */
export function exportAsArchive(node_id: string) {
  const domnode = document.getElementById(node_id);

  // recursively collect all the nodes with position and size
  // Recursive function to collect node data
  function collectNodeData(node: HTMLElement): any {
    const boundingRect = node.getBoundingClientRect();

    return {
      id: node.getAttribute("id") || null,
      tag: node.tagName.toLowerCase(),
      styles: getComputedStyle(node),
      attributes: Array.from(node.attributes).reduce(
        (acc, attr) => {
          acc[attr.name] = attr.value;
          return acc;
        },
        {} as Record<string, string>
      ),
      position: {
        x: boundingRect.left,
        y: boundingRect.top,
      },
      size: {
        width: boundingRect.width,
        height: boundingRect.height,
      },
      children: Array.from(node.children)
        .filter((child) => child instanceof HTMLElement)
        .map((child) => collectNodeData(child as HTMLElement)),
    };
  }

  // Collect all data starting from the root node
  const nodeData = collectNodeData(domnode!);
  //

  saveAs(
    new Blob([JSON.stringify(nodeData, null, 2)], { type: "application/json" }),
    "node-data.json"
  );
  //
}

export function ExportNodeControl({
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
    exportAsImage(node_id, format, { filename: `${name}.${format}` });
  };

  return (
    <>
      <AdvancedExportDialog
        {...advancedExportDialog.props}
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
        <DropdownMenuContent side="left" align="start" collisionPadding={16}>
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
  const [backend, setBackend] = React.useState<"canvas" | "p666">("canvas");
  const [format, setFormat] = React.useState<"png" | "svg" | "archive" | "pdf">(
    "png"
  );
  const [name, setName] = React.useState<string>(defaultName);
  const [xpath, setXPath] = React.useState<string>("");

  const options = {
    canvas: ["png", "svg", "archive"],
    p666: ["png", "pdf"],
  };

  const onExport = () => {
    switch (format) {
      case "png":
      case "svg":
        exportAsImage(node_id, format, {
          filename: name + "." + format,
          xpath,
        });
        break;
      case "archive":
        exportAsArchive(node_id);
        break;
      case "pdf":
        exportWithP666(node_id, format, {
          filename: name + "." + format,
        });
        break;
    }
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
                  value="png"
                  disabled={!options[backend].includes("png")}
                >
                  PNG
                </SelectItem>
                <SelectItem
                  value="svg"
                  disabled={!options[backend].includes("svg")}
                >
                  SVG
                </SelectItem>
                <SelectItem
                  value="pdf"
                  disabled={!options[backend].includes("pdf")}
                >
                  PDF
                </SelectItem>
                <SelectItem
                  value="archive"
                  disabled={!options[backend].includes("archive")}
                >
                  Archive - for testing & custom rendering
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
                  <QuestionMarkCircledIcon className="w-3 h-3 me-2 inline" />
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
