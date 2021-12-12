import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { PreviewAndRunPanel } from "components/preview-and-run";
import { EditorAppbarFragments, EditorSidebar } from "components/editor";
import { Result } from "@designto/code";
import { InteractiveCanvas } from "components/canvas";
import { VanillaRunner } from "components/app-runner/vanilla-app-runner";

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
    <CanvasContainer id="canvas">
      <EditorAppbarFragments.Canvas />
      {/* <div
        style={{
          display: "flex",
          justifyContent: "center",
          flex: 1,
        }}
      > */}
      <InteractiveCanvas key={fileid + sceneid} defaultSize={originsize}>
        {preview ? (
          <VanillaRunner
            key={preview.scaffold.raw}
            style={{
              borderRadius: 4,
              boxShadow: "0px 0px 48px #00000020",
            }}
            source={preview.scaffold.raw}
            width="100%"
            height="100%"
            componentName={preview.name}
          />
        ) : (
          <EditorCanvasSkeleton />
        )}
      </InteractiveCanvas>
      {/* </div> */}
    </CanvasContainer>
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

const CanvasContainer = styled.div`
  display: flex;
  flex-direction: column;
  max-width: calc((100vw - 200px) / 2); // TODO: make this dynamic
  height: 100%;
`;
