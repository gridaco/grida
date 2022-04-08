import React, { ReactEventHandler, useEffect, useRef } from "react";

export const VanillaRunner = React.forwardRef(function (
  {
    width,
    height,
    source,
    onLoad,
    enableInspector = true,
    style,
  }: {
    width: string;
    height: string;
    source: string;
    onLoad?: ReactEventHandler<HTMLIFrameElement>;
    componentName: string;
    enableInspector?: boolean;
    style?: React.CSSProperties;
  },
  ref: React.MutableRefObject<HTMLIFrameElement>
) {
  const lref = useRef(null);
  const cref = ref || lref;

  useEffect(() => {
    if (cref.current) {
      function disablezoom() {
        cref.current.contentWindow.addEventListener(
          "wheel",
          (event) => {
            const { ctrlKey } = event;
            if (ctrlKey) {
              event.preventDefault();
              return;
            }
          },
          { passive: false }
        );
      }
      cref.current.contentWindow.addEventListener(
        "DOMContentLoaded",
        disablezoom,
        false
      );
    }
  }, [cref.current]);

  useEffect(() => {
    const cb = (e) => {
      if (enableInspector) {
        const matches =
          cref.current?.contentDocument?.querySelectorAll(
            "div, span, img, image, svg" // button, input - disabled due to interaction testing (for users)
          ) ?? [];
        matches.forEach((el) => {
          const tint = "rgba(20, 0, 255, 0.2)";
          const tintl = "rgba(20, 0, 255, 0.5)";
          const originstyle = {
            //@ts-ignore
            ...el.style,
          };

          if (el.id.includes("RootWrapper")) {
          } else {
            el.addEventListener("mouseenter", (e) => {
              //@ts-ignore
              e.target.style.background = tint;
              //@ts-ignore
              e.target.style.outline = `${tintl} solid 1px`;
            });
            el.addEventListener("mouseleave", (e) => {
              //@ts-ignore
              e.target.style.background = originstyle.background;
              //@ts-ignore
              e.target.style.outline = originstyle.outline;
            });
          }
        });

        // cref.current.contentWindow.addEventListener("click", (e) => {
        //   console.log("click", e);
        // });
      }
    };

    if (cref.current) {
      cref.current.onload = cb;
    }

    return () => {
      cref?.current?.onload && (cref.current.onload = () => {});
    };
  }, [cref.current, enableInspector]);

  const inlinesource = source || `<div></div>`;
  return (
    <iframe
      ref={cref}
      onLoad={onLoad}
      style={style}
      sandbox="allow-same-origin allow-scripts"
      srcDoc={inlinesource}
      width={width}
      height={height}
    />
  );
});
