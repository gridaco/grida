import {
  buildFlutterFrameUrl,
  FlutterFrameQuery,
} from "@bridged.xyz/base-sdk/dist/lib/frame-embed";
import { nanoid } from "nanoid";
import { useEffect, useState } from "react";

export function FlutterAppRunner(props: {
  q: FlutterFrameQuery;
  width: number;
  height: number;
}) {
  const frameUrl = buildFlutterFrameUrl(props.q);

  return (
    <iframe
      src={frameUrl}
      style={{
        width: props.width,
        height: props.height,
      }}
    />
  );
}

///// run app using console
///// leave this for future dev perpose

function HostedFlutterAppRunner(props: {
  q: {
    src: string;
  };
}) {
  const [frameUrl, setFrameUrl] = useState<string>();
  const id = nanoid();
  useEffect(() => {
    buildUrlFromSrc({
      id: id,
      src: props.q.src,
    }).then((r) => {
      setFrameUrl(r);
    });
  }, []);

  return frameUrl ? (
    <>
      <iframe src={frameUrl} />
    </>
  ) : (
    <></>
  );
}

import { buildConsoleQuicklookUrl } from "@bridged.xyz/base-sdk/dist/lib/projects/quicklook";
import { types, hosting } from "@bridged.xyz/base-sdk";

async function buildUrlFromSrc(params: { id: string; src: string }) {
  const srcHosted = await hosting.upload({
    file: params.src,
    name: params.id,
  });

  const url = buildConsoleQuicklookUrl({
    id: params.id,
    name: "example",
    language: types.AppLanguage.dart,
    framework: types.AppFramework.flutter,
    url: srcHosted.url,
  });

  return url;
}
