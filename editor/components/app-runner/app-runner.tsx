import React, { useRef, useState } from "react";
import { FlutterAppRunner } from "./flutter-app-runner";
import { features, types, hosting } from "@base-sdk/base";
import { nanoid } from "nanoid";
import { ReactAppRunner } from "./react-app-runner";
import { VanillaRunner } from "./vanilla-app-runner";
import { NumberSize, Resizable } from "re-resizable";
import { Direction } from "re-resizable/lib/resizer";

type Platform = "flutter" | "react" | "vanilla" | "vue" | "svelte";

const DEFAULT_SIZE = {
  width: 375,
  height: 812,
};

export function AppRunner(props: {
  platform: Platform;
  sceneSize: {
    w: number;
    h: number;
  };
  src: string;
  componentName: string;
}) {
  const [viewportsize, setViewportsize] = useState<{
    height: number;
    width: number;
  }>(DEFAULT_SIZE);
  const { platform, sceneSize, src, componentName } = props;

  return (
    <div
      style={{
        margin: 24,
      }}
    >
      <ResizableContainer
        onResize={(w, h) => {
          setViewportsize({
            width: w,
            height: h,
          });
        }}
        initialSize={{
          width: viewportsize.width,
          height: viewportsize.height,
        }}
      >
        <div
          style={{
            width: viewportsize.width || sceneSize.w || "100%",
            height: viewportsize.height || sceneSize.h || "100%",
            boxShadow: "0px 0px 48px #63636328",
          }}
        >
          <DedicatedFrameworkRunner
            platform={platform}
            src={src}
            componentName={componentName}
          />
        </div>
      </ResizableContainer>
    </div>
  );
}

function DedicatedFrameworkRunner({
  platform,
  componentName,
  src,
}: {
  componentName: string;
  platform: Platform;
  src: string;
}) {
  switch (platform) {
    case "flutter":
      return (
        <div>
          <FlutterAppRunner
            width="100%"
            height="100%"
            q={{
              language: "dart",
              src: src,
            }}
          />
          <button
            onClick={() => {
              const _name = "fluttercodefromdesigntocode";
              hosting
                .upload({
                  file: src,
                  name: `${_name}.dart`,
                })
                .then((r) => {
                  const qlurl = features.quicklook.buildConsoleQuicklookUrl({
                    id: nanoid(),
                    framework: types.AppFramework.flutter,
                    language: types.AppLanguage.dart,
                    url: r.url,
                    name: _name,
                  });
                  open(qlurl);
                });
            }}
          >
            open in console
          </button>
        </div>
      );
    case "react":
      return (
        <ReactAppRunner
          width="100%"
          height="100%"
          source={src}
          componentName={componentName}
        />
      );
    case "vanilla":
      return (
        <VanillaRunner
          width="100%"
          height="100%"
          source={src}
          componentName={componentName}
        />
      );
  }
}

function ResizableContainer({
  onResize,
  initialSize = DEFAULT_SIZE,
  children,
}: {
  onResize: (w: number, h: number) => void;
  initialSize?: {
    width: number;
    height: number;
  };
  children: React.ReactNode;
}) {
  const resizable = useRef<Resizable>();
  const _onResize = (
    event: MouseEvent | TouchEvent,
    direction: Direction,
    elementRef: HTMLElement,
    delta: NumberSize
  ) => {
    const newSize = resizable?.current?.size;
    if (newSize) {
      onResize(newSize.width, newSize.height);
    }
  };

  return (
    <Resizable
      ref={resizable}
      defaultSize={initialSize}
      onResize={_onResize}
      handleComponent={{
        bottomRight: ResizeKnob(),
      }}
    >
      {children}
    </Resizable>
  );
}

const ResizeKnob = (props?: any) => (
  <div
    style={{
      background: "#fff",
      borderRadius: "2px",
      border: "1px solid #ddd",
      height: "100%",
      width: "100%",
      padding: 0,
    }}
    className={"SomeCustomHandle"}
    {...props}
  >
    <svg
      width="20px"
      height="20px"
      version="1.1"
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="m70.129 67.086l1.75-36.367c-0.035156-2.6523-2.9414-3.6523-4.8164-1.7773l-8.4531 8.4531-17.578-17.574c-2.3438-2.3438-5.7188-1.5625-8.0586 0.78125l-13.078 13.078c-2.3438 2.3438-2.4141 5.0117-0.074219 7.3516l17.574 17.574-8.4531 8.4531c-1.875 1.875-0.83594 4.8203 1.8164 4.8555l36.258-1.8594c1.6836 0.019531 3.1328-1.2812 3.1133-2.9688z" />
    </svg>
  </div>
);
