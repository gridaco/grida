import React, { useEffect, useRef, useState } from "react";
import type { IScenePreviewDataFlutterPreview } from "core/states";
import FlutterDaemonView from "@code-editor/flutter-daemon-view";

const dartservices_html_src = "https://dartpad.dev/scripts/frame_dark.html";

export function VanillaFlutterRunner({
  updatedAt,
  widgetKey,
  loader,
  source,
}: IScenePreviewDataFlutterPreview) {
  switch (loader) {
    case "vanilla-flutter-template": {
      return <DartpadServedHtmlIframe key={widgetKey.id} js={source} />;
    }
    case "flutter-daemon-view": {
      // return <FlutterDaemonView key={widgetKey.id} src={source} />;
      return (
        <iframe
          key={updatedAt.toString()}
          style={{
            width: "100%",
            height: "100%",
            border: "none",
          }}
          src={source}
        />
      );
    }
    default: {
      throw new Error(`Unsupported loader: ${loader}`);
    }
  }
}

/**
 * @see https://dartpad.dev/scripts/frame.js
 * @returns
 */
function DartpadServedHtmlIframe({ js }: { js: string }) {
  const [booting, setBooting] = useState(true);
  const ref = useRef<HTMLIFrameElement>();

  useEffect(() => {
    window.addEventListener("message", (e) => {
      const { sender, type } = e.data;
      if (sender === "frame" && type === "ready") {
        setBooting(false);
      }
    });
  }, []);

  useEffect(() => {
    if (booting) return;
    ref.current.contentWindow.postMessage(
      {
        addFirebaseJs: false,
        addRequireJs: true,
        command: "execute",
        css: "",
        destroyFrame: true,
        html: "",
        js: js,
      },
      "*"
    );
  }, [booting, js]);

  return (
    <iframe
      width="100%"
      height="100%"
      sandbox="allow-scripts allow-popups"
      ref={ref}
      src={dartservices_html_src}
      style={{
        borderRadius: 4,
        backgroundColor: "white",
        boxShadow: "0px 0px 48px #00000020",
      }}
    />
  );
}

// export function FlutterAppRunner(props: {
//   q: FlutterFrameQuery;
//   width: number | string;
//   height: number | string;
// }) {
//   const [frameUrl, setFrameUrl] = useState<string>();

//   useEffect(() => {
//     if (
//       props.q.src.length > DUE_TO_MAX_URL_LENGHT_THE_MAX_LENGTH_ACCEPTED_FOR_SRC
//     ) {
//       const id = nanoid();
//       buildHostedSrcFrameUrl({
//         id: id,
//         src: props.q.src,
//       }).then((r) => {
//         setFrameUrl(r);
//       });
//     } else {
//       // use the efficient non-hosting option if possible
//       const _frameUrl = buildFlutterFrameUrl(props.q);
//       setFrameUrl(_frameUrl);
//     }
//   }, [props.q.src]);

//   return frameUrl ? (
//     <iframe
//       src={frameUrl}
//       style={{
//         width: props.width,
//         height: props.height,
//       }}
//     />
//   ) : (
//     <>App is not ready</>
//   );
// }

// import { hosting } from "@base-sdk/base";

// async function buildHostedSrcFrameUrl(params: { id: string; src: string }) {
//   const srcHosted = await hosting.upload({
//     file: params.src,
//     name: params.id,
//   });

//   const url = buildFlutterFrameUrl({
//     mode: "url",
//     src: srcHosted.url,
//     language: "dart",
//   });

//   return url;
// }
