import React, { useState, useEffect } from "react";
import { fetchNodeAsImage } from "@design-sdk/figma-remote";

const DEV_ONLY_FIGMA_PAT =
  process.env.NEXT_PUBLIC_DEVELOPER_FIGMA_PERSONAL_ACCESS_TOKEN;

export function FigmaFrameImageView({
  filekey,
  nodeid,
  zoom,
}: {
  filekey: string;
  nodeid: string;
  zoom: number;
}) {
  // fetch image
  const [image_1, setImage_1] = useState<string>();
  const [image_s, setImage_s] = useState<string>();

  useEffect(() => {
    // fetch image from figma
    // fetch smaller one first, then fatch the full scaled.
    fetchNodeAsImage(
      filekey,
      { personalAccessToken: DEV_ONLY_FIGMA_PAT },
      nodeid
      // scale = 1
    ).then((r) => {
      console.log("fetched image from figma", r);
      setImage_1(r.__default);
      setImage_s(r.__default);
    });
  }, [filekey, nodeid]);

  let imgscale: 1 | 0.2 = 1;
  if (zoom > 1) {
    return null;
  } else if (zoom <= 1 && zoom > 0.3) {
    imgscale = 1;
    // display 1 scaled image
  } else {
    // display 0.2 scaled image
    imgscale = 0.2;
  }

  return (
    <div
      style={{
        top: 0,
        left: 0,
        position: "fixed",
        width: "100%",
        height: "100%",
      }}
    >
      <img
        style={{
          width: "100%",
          height: "100%",
          objectFit: "fill",
          border: 0,
        }}
        src={imgscale === 1 ? image_1 : image_s}
        alt=""
      />
    </div>
  );
}
