import React from "react";
import { FlutterAppRunner } from "./flutter-app-runner";
import { features, types, hosting } from "@base-sdk/base";
import { nanoid } from "nanoid";
import { ReactAppRunner } from "./react-app-runner";
import { VanillaRunner } from "./vanilla-app-runner";

export function AppRunner(props: {
  platform: "flutter" | "react" | "vanilla" | "vue" | "svelte";
  sceneSize: {
    w: number | string;
    h: number | string;
  };
  src: string;
  componentName: string;
}) {
  const { platform, sceneSize, src, componentName } = props;
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
