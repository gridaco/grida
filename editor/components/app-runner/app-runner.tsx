import React from "react";
import { CodeSandBoxView } from "./code-sandbox-runner";
import { FlutterAppRunner } from "./flutter-app-runner";

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
        <FlutterAppRunner
          width="300px"
          height="100%"
          q={{
            language: "dart",
            src: src,
          }}
        />
      );
    case "web":
      return <CodeSandBoxView width="300px" height="100%" src={src} />;
  }
}
