import React from "react";

export function VanillaRunner({
  width,
  height,
  source,
}: {
  width: string;
  height: string;
  source: string;
  componentName: string;
}) {
  const inlinesource = source || `<div></div>`;
  return (
    <>
      <iframe
        sandbox="allow-same-origin"
        srcDoc={inlinesource}
        width={width}
        height={height}
      />
    </>
  );
}
