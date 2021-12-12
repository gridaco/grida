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
      {/* {preview ? (
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
      )} */}
      <InteractiveCanvas>
        {preview ? (
          <div
            style={{
              width: originsize.width,
              height: originsize.height,
            }}
          >
            <VanillaRunner
              source={preview.scaffold.raw}
              width={"100%"}
              height={"100%"}
              componentName={preview.name}
            />
          </div>
        ) : (
          <EditorCanvasSkeleton />
        )}
        {/* <div
          style={{
            height: 812,
            background: "white",
          }}
        ></div> */}
      </InteractiveCanvas>
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
  height: 100%;
`;
