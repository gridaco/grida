import { toPng } from "html-to-image";
import { saveAs } from "file-saver";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";

export function ExportNodeWithHtmlToImage({
  node_id,
  name,
}: {
  node_id: string;
  name: string;
}) {
  const format = "png";
  const filename = `${name}.${format}`;

  const onClick = () => {
    const domnode = document.getElementById(node_id);
    if (!domnode) {
      toast.error("Node not found");
      return;
    }
    //
    toPng(domnode).then((dataUrl) => {
      // Convert data URL to Blob
      fetch(dataUrl)
        .then((res) => res.blob())
        .then((blob) => saveAs(blob, filename))
        .catch(() => toast.error("Failed to save image"));
    });
  };

  return (
    <Button variant="outline" size="xs" onClick={onClick} className="w-full">
      Export {filename}
    </Button>
  );
}
