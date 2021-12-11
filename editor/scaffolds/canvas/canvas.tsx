import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { PreviewAndRunPanel } from "components/preview-and-run";
import { EditorAppbarFragments, EditorSidebar } from "components/editor";
import { Result } from "@designto/code";

export function Canvas({
  preview,
  originsize,
  fileid,
  sceneid,
}: {
  fileid: string;
  sceneid: string;
  originsize: { width: number; height: number };
  preview: Result;
}) {
  return (
    <>
      <EditorAppbarFragments.Canvas />
      {preview ? (
        <PreviewAndRunPanel
          // key={_key_for_preview}
          config={{
            src: preview.scaffold.raw,
            platform: "vanilla",
            componentName: preview.name,
            sceneSize: originsize && {
              w: originsize.width,
              h: originsize.height,
            },
            initialMode: "run",
            fileid: fileid,
            sceneid: sceneid,
            hideModeChangeControls: true,
          }}
        />
      ) : (
        <EditorCanvasSkeleton />
      )}
    </>
  );
}

const EditorCanvasSkeleton = () => {
  return (
    <PreviewAndRunPanel
      config={{
        src: "",
        platform: "vanilla",
        componentName: "loading",
        sceneSize: {
          w: 375,
          h: 812,
        },
        initialMode: "run",
        fileid: "loading",
        sceneid: "loading",
        hideModeChangeControls: true,
      }}
    />
  );
};
