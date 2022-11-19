import React from "react";
import { useFigmaImageService } from "./editor-figma-image-service-provider";
import { FigmaNodeBitmapPreviewServiceProvider } from "@code-editor/canvas-renderer-bitmap";

export function FigmaImageServiceProviderForCanvasRenderer({
  children,
}: React.PropsWithChildren<{}>) {
  const fis = useFigmaImageService();

  const service = React.useMemo(
    () => ({
      fetch: async (id: string) => {
        const res = await fis.fetch(id, { debounce: true, ensure: true });
        return res[id];
      },
    }),
    [fis]
  );

  return (
    <FigmaNodeBitmapPreviewServiceProvider service={service}>
      {children}
    </FigmaNodeBitmapPreviewServiceProvider>
  );
}
