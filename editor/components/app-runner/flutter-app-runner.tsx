import React from "react";
import {
  buildFlutterFrameUrl,
  FlutterFrameQuery,
} from "@bridged.xyz/base-sdk/dist/lib/frame-embed";
import { nanoid } from "nanoid";
import { useEffect, useState } from "react";

const MAX_URL_LENGTH = 2048;
const DUE_TO_MAX_URL_LENGHT_THE_MAX_LENGTH_ACCEPTED_FOR_SRC = 1800;

export function FlutterAppRunner(props: {
  q: FlutterFrameQuery;
  width: number;
  height: number;
}) {
  const [frameUrl, setFrameUrl] = useState<string>();

  useEffect(() => {
    if (
      props.q.src.length > DUE_TO_MAX_URL_LENGHT_THE_MAX_LENGTH_ACCEPTED_FOR_SRC
    ) {
      const id = nanoid();
      buildHostedSrcFrameUrl({
        id: id,
        src: props.q.src,
      }).then((r) => {
        setFrameUrl(r);
      });
    } else {
      // use the efficient non-hosting option if possible
      const _frameUrl = buildFlutterFrameUrl(props.q);
      setFrameUrl(_frameUrl);
    }
  }, [props.q.src]);

  return frameUrl ? (
    <iframe
      src={frameUrl}
      style={{
        width: props.width,
        height: props.height,
      }}
    />
  ) : (
    <>App is not ready</>
  );
}

import { hosting } from "@bridged.xyz/base-sdk";

async function buildHostedSrcFrameUrl(params: { id: string; src: string }) {
  const srcHosted = await hosting.upload({
    file: params.src,
    name: params.id,
  });

  const url = buildFlutterFrameUrl({
    mode: "url",
    src: srcHosted.url,
    language: "dart",
  });

  return url;
}
