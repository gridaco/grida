import React, { useState, useEffect } from "react";
import { ReflectSceneNode } from "@design-sdk/figma-node";
import type { FrameOptimizationFactors } from "@code-editor/canvas/frame";
import { blurred_bg_fill } from "./util";
import { CircularProgress } from "@mui/material";
import { useFigmaImageService } from "scaffolds/editor";

/**
 * 1 = 1 scale
 * s = 0.2 scale
 */
type ImageSizeVariant = "1" | "s";

export function FigmaStaticImageFrameView({
  target,
  zoom,
  inViewport,
}: {
  target: ReflectSceneNode;
} & FrameOptimizationFactors) {
  const service = useFigmaImageService();
  const { filekey: _fk, id, width, height } = target;
  const filekey = _fk as string;
  const key = `${filekey}-${id}`;
  // fetch image
  const [src, setsrc] = useState<string>();
  const [loaded, setloaded] = useState(false);

  const set_image = (src: string) => {
    setsrc(src);
  };

  useEffect(() => {
    service
      .fetch(id, {
        // debounce: true,
        ensure: true,
      })
      .then((res) => {
        const src = res[id];
        set_image(src);
      });
  }, [filekey, id]);

  const bg_color_str = blurred_bg_fill(target);

  return (
    <div
      style={{
        width: width,
        height: height,
        borderRadius: 1,
        backgroundColor: !(src && loaded) && bg_color_str,
        contain: "layout style paint",
      }}
    >
      <div
        style={{
          top: 0,
          left: 0,
          position: "fixed",
          width: "100%",
          height: "100%",
        }}
      ></div>
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
            <CircularProgress />
          </div>
        </>
      )}
    </div>
  );
}
