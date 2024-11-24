import { toPng, toSvg } from "html-to-image";
import { saveAs } from "file-saver";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export function ExportNodeWithHtmlToImage({
  node_id,
  name,
}: {
  node_id: string;
  name: string;
}) {
  const onExport = (format: "svg" | "png") => {
    const filename = `${name}.${format}`;
    const domnode = document.getElementById(node_id);
    if (!domnode) {
      toast.error("Node not found");
      return;
    }
    //
    switch (format) {
      case "png": {
        toPng(domnode).then((dataUrl) => {
          // Convert data URL to Blob
          fetch(dataUrl)
            .then((res) => res.blob())
            .then((blob) => saveAs(blob, filename))
            .catch(() => toast.error("Failed to save image"));
        });
        break;
      }
      case "svg": {
        toSvg(domnode).then((dataUrl) => {
          // Convert data URL to Blob
          fetch(dataUrl)
            .then((res) => res.blob())
            .then((blob) => saveAs(blob, filename))
            .catch(() => toast.error("Failed to save image"));
        });
        break;
      }
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="xs" className="w-full overflow-hidden">
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
