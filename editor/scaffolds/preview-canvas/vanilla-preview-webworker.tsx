import React, { useEffect, useState } from "react";
import type { Result } from "@designto/code";
import { PreviewContent } from "./preview-content";
import type { VanillaPreviewProps } from "./prop-type";
import { blurred_bg_fill } from "./util";
import { cachekey, cache } from "./cache";
import { preview as wwpreview } from "./canvas-preview-worker-messenger";

export function WebWorkerD2CVanillaPreview({ target }: VanillaPreviewProps) {
  const [preview, setPreview] = useState<Result>();
  const bg_color_str = blurred_bg_fill(target);

  useEffect(() => {
    if (preview) {
      return;
    }

    wwpreview(target.id, setPreview);
  }, [target?.id]);

  return (
    <PreviewContent
      id={target.id}
      name={target.name}
      source={preview?.scaffold?.raw}
      width={target.width}
      height={target.height}
      backgroundColor={
        !preview && bg_color_str // clear bg after preview is rendered.
      }
    />
  );
}
