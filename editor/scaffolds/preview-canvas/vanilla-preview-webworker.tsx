import React, { useEffect, useState } from "react";
import type { Result } from "@designto/code";
import { PreviewContent } from "./preview-content";
import type { VanillaPreviewProps } from "./prop-type";
import { blurred_bg_fill } from "@code-editor/canvas-renderer-core";
import { cachekey, cache } from "./cache";
import { preview as wwpreview } from "../code/code-worker-messenger";

export function WebWorkerD2CVanillaPreview({ target }: VanillaPreviewProps) {
  const [preview, setPreview] = useState<Result>();
  const bg_color_str = blurred_bg_fill(target);

  useEffect(() => {
    if (preview) {
      return;
    }

    let dispose;

    setTimeout(() => {
      dispose = wwpreview(
        {
          page: "", // TODO:
          // page: target.page,
          target: target.id,
        },
        setPreview
      );
    }, 50);

    return () => {
      dispose?.();
    };
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
