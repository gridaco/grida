import React from "react";
import { VanillaRunner } from "components/app-runner/vanilla-app-runner";
import { ScenePreviewData } from "core/states";
import { VanillaESBuildAppRunner } from "components/app-runner";

export function VanillaDedicatedPreviewRenderer({
  loader,
  componentName,
  source,
}: ScenePreviewData) {
  return (
    <>
      {loader === "vanilla-esbuild-template" ? (
        <VanillaESBuildAppRunner
          componentName={componentName}
          doc={{
            html: source.html,
            javascript: source.javascript,
          }}
        />
      ) : (
        <VanillaRunner
          key={source}
          style={{
            borderRadius: 4,
            boxShadow: "0px 0px 48px #00000020",
          }}
          source={source}
          componentName={componentName}
        />
      )}
    </>
  );
}
