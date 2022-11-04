import React from "react";
import { VanillaRunner } from "components/app-runner/vanilla-app-runner";

export function PreviewContent({
  width,
  height,
  backgroundColor,
  id,
  source,
  name,
}: {
  width: number;
  height: number;
  backgroundColor: string;
  id: string;
  source: string;
  name: string;
}) {
  return (
    <div
      style={{
        width: width,
        height: height,
        borderRadius: 1,
        backgroundColor: backgroundColor,
        contain: "layout style paint",
      }}
    >
      {source && (
        <VanillaRunner
          key={id}
          style={{
            borderRadius: 1,
            contain: "layout style paint",
          }}
          source={source}
          width="100%"
          height="100%"
          componentName={name}
        />
      )}
    </div>
  );
}
