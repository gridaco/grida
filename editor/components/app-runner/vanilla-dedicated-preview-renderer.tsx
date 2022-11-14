import React from "react";
import { VanillaRunner } from "components/app-runner/vanilla-app-runner";
import type { ScenePreviewData } from "core/states";
import { VanillaESBuildAppRunner } from "components/app-runner";
import { VanillaFlutterRunner } from "./flutter-app-runner";

export function VanillaDedicatedPreviewRenderer({
  widgetKey,
  loader,
  componentName,
  source,
  enableIspector = false,
  ...props
}: ScenePreviewData & {
  enableIspector?: boolean;
}) {
  switch (loader) {
    case "vanilla-esbuild-template": {
      return (
        <VanillaESBuildAppRunner
          key={widgetKey.id}
          componentName={componentName}
          doc={{
            html: source.html,
            javascript: source.javascript,
          }}
        />
      );
    }
    case "flutter-daemon-view":
    case "vanilla-flutter-template": {
      return (
        <VanillaFlutterRunner
          key={widgetKey.id}
          componentName={componentName}
          source={source}
          widgetKey={widgetKey}
          loader={loader}
          {...props}
        />
      );
    }
    case "vanilla-html": {
      return (
        <VanillaRunner
          key={widgetKey.id}
          background="white"
          enableInspector={enableIspector}
          source={source}
          componentName={componentName}
        />
      );
    }
  }
}
