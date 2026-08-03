"use client";

import { Download } from "lucide-react";
import { Button } from "@app/ui/components/button";

/** Browser-local download for an already materialized File. */
export function FileDownloadButton({ file }: { file: File }) {
  const download = () => {
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <Button type="button" size="sm" variant="outline" onClick={download}>
      <Download aria-hidden />
      Download
    </Button>
  );
}
