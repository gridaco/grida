import React, { useEffect, useRef } from "react";

export function VanillaRunner({
  width,
  height,
  source,
  enableInspector = true,
}: {
  width: string;
  height: string;
  source: string;
  componentName: string;
  enableInspector?: boolean;
}) {
  const ref = useRef<HTMLIFrameElement>();

  useEffect(() => {
    if (ref.current) {
      function disablezoom() {
        ref.current.contentWindow.addEventListener(
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
      ref.current.contentWindow.addEventListener(
        "DOMContentLoaded",
        disablezoom,
        false
      );
    }
  }, [ref.current]);

  useEffect(() => {
    if (ref.current && enableInspector) {
      ref.current.onload = () => {
        const matches = ref.current.contentDocument.querySelectorAll(
          "div, span, button, img, image, svg"
        );
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

        ref.current.contentWindow.addEventListener("click", (e) => {
          console.log("click", e);
        });
      };
    }
  }, [ref.current, enableInspector]);

  const inlinesource = source || `<div></div>`;
  return (
    <iframe
      ref={ref}
      sandbox="allow-same-origin"
      srcDoc={inlinesource}
      width={width}
      height={height}
    />
  );
}
