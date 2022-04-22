import React, { useEffect, useState } from "react";
import { IsolatedCanvas } from "components/canvas";
import { PreviewAndRunPanel } from "components/preview-and-run";
import { useEditorState } from "core/states";
import { VanillaDedicatedPreviewRenderer } from "components/app-runner";
import { Devtools } from "scaffolds/devtools";

export function IsolateModeCanvas({
  hidden = false,
  onClose,
  onEnterFullscreen,
}: {
  hidden?: boolean;
  onClose: () => void;
  onEnterFullscreen: () => void;
}) {
  const [state] = useEditorState();

  const {
    fallbackSource,
    loader,
    source,
    initialSize,
    isBuilding,
    widgetKey,
    componentName,
  } = state.currentPreview || {
    isBuilding: true,
  };

  return (
    <div style={{ display: hidden && "hidden" }}>
      <IsolatedCanvas
        key={widgetKey?.id}
        building={isBuilding}
        onExit={onClose}
        onFullscreen={onEnterFullscreen}
        defaultSize={{
          width: initialSize?.width ?? 375,
          height: initialSize?.height ?? 812,
        }}
      >
        <>
          {source ? (
            <VanillaDedicatedPreviewRenderer
              {...state.currentPreview}
              enableIspector
            />
          ) : (
            <EditorCanvasSkeleton />
          )}
        </>
      </IsolatedCanvas>
      <Devtools />
    </div>
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
