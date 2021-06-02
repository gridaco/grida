import React from "react";
import { CodeSandBoxView } from "./code-sandbox-runner";
import { FlutterAppRunner } from "./flutter-app-runner";
import { features, types, hosting } from "@base-sdk/base";
import { nanoid } from "nanoid";

export function AppRunner(props: {
  platform: "flutter" | "web";
  sceneSize: {
    w: number | string;
    h: number | string;
  };
  src: string;
}) {
  const { platform, sceneSize, src } = props;
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
    case "web":
      return <CodeSandBoxView width="300px" height="100%" src={src} />;
  }
}
