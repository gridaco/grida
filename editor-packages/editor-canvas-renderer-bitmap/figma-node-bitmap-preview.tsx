import React, { useState, useEffect } from "react";
import type { ReflectSceneNode } from "@design-sdk/figma-node";
import type { FrameOptimizationFactors } from "@code-editor/canvas/frame";
import { blurred_bg_fill } from "@code-editor/canvas-renderer-core";
import { CircularProgress } from "@mui/material";

interface BitmapPreviewService {
  fetch: (
    id: string,
    options?: {
      scale?: number;
    }
  ) => Promise<string>;
}

const Context = React.createContext<BitmapPreviewService>(null);

const usefigmaBitmapPreviewService = () => {
  const context = React.useContext(Context);
  if (!context || typeof context.fetch !== "function") {
    throw new Error(
      "Bitmap service is not available. Are you sure you have an <FigmaNodeBitmapPreviewServiceProvider> above your consumers?"
    );
  }
  return context;
};

export function FigmaNodeBitmapPreviewServiceProvider({
  children,
  service,
}: React.PropsWithChildren<{ service: BitmapPreviewService }>) {
  return <Context.Provider value={service}>{children}</Context.Provider>;
}

type TargetSceneMeta = {
  id: string;
  filekey: ReflectSceneNode["filekey"];
  name: string;
  width: number;
  height: number;
};

/**
 * 1 = 1 scale
 * s = 0.2 scale
 */
type ImageSizeVariant = "1" | "s";

export function FigmaNodeBitmapView({
  target,
  zoom,
  inViewport,
  background,
}: {
  target: TargetSceneMeta;
} & FrameOptimizationFactors & {
    background?: React.CSSProperties["background"];
  }) {
  const service = usefigmaBitmapPreviewService();
  const { filekey: _fk, id, width, height } = target;
  const filekey = _fk as string;

  // fetch image
  const [src, setsrc] = useState<string>();
  const [loaded, setloaded] = useState(false);

  const set_image = (src: string) => {
    setsrc(src);
  };

  useEffect(() => {
    if (!inViewport) {
      return;
    }

    if (src) {
      return;
    }

    if (service) {
      service
        .fetch(id)
        .then((res) => {
          const src = res;
          set_image(src);
        })
        .catch(console.error);
    }
  }, [filekey, id, service, inViewport]);

  const bg_color_str =
    "fills" in target ? blurred_bg_fill(target["fills"] as any) : "white";

  return (
    <div
      style={{
        width: width,
        height: height,
        borderRadius: 1,
        background: background
          ? background
          : !(src && loaded)
          ? bg_color_str
          : undefined,
        contain: "layout style paint",
      }}
    >
      {src ? (
        <img
          onLoad={() => {
            setloaded(true);
          }}
          loading="lazy"
          style={{
            visibility: inViewport ? "visible" : "hidden",
            width: "100%",
            height: "100%",
            objectFit: "none",
            border: 0,
          }}
          src={src}
          alt=""
        />
      ) : (
        // loading view
        <>
          {/* center */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
            }}
          >
            <CircularProgress
              sx={{
                opacity: 0.2,
                color: "black",
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
