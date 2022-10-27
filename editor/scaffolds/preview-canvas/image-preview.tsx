import React, { useState, useEffect } from "react";
import { ReflectSceneNode } from "@design-sdk/figma-node";
import type { FrameOptimizationFactors } from "@code-editor/canvas/frame";
import { fetchNodeAsImage } from "@design-sdk/figma-remote";
import { useFigmaAccessToken } from "hooks/use-figma-access-token";
import { blurred_bg_fill } from "./util";
import { CircularProgress } from "@mui/material";

const cache = {
  get: (key: string, variant?: ImageSizeVariant) => {
    return localStorage.getItem(`${key}${!!variant ? "." + variant : ""}`);
  },
  set: (key: string, value: string, variant?: ImageSizeVariant) => {
    localStorage.setItem(`${key}${!!variant ? "." + variant : ""}`, value);
  },
};

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
  const { filekey: _fk, id, width, height } = target;
  const filekey = _fk as string;
  const key = `${filekey}-${id}`;
  // fetch image
  const [src, setsrc] = useState<string>();
  const token = useFigmaAccessToken();
  const [loaded, setloaded] = useState(false);

  const set_image = (src: string, variant?: ImageSizeVariant) => {
    setsrc(src);
    cache.set(key, src, variant);
  };

  useEffect(() => {
    if (!token || !(token.personalAccessToken || token.accessToken.token)) {
      return;
    }

    const cached_1 = cache.get(key, "1");

    if (cached_1) {
      set_image(cached_1, "1");
      return;
    }

    // fetch image from figma
    // fetch smaller one first, then fatch the full scaled.
    fetchNodeAsImage(
      filekey,
      {
        personalAccessToken: token.personalAccessToken,
        accessToken: token.accessToken.token,
      },
      id
      // scale = 1
    ).then((r) => {
      set_image(r.__default, "1");
    });
  }, [filekey, id, token]);

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
