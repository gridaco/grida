import { SceneRecord } from "@base-sdk/scene-store";
import React, { useEffect } from "react";
import { ScaffoldSceneSnapshotView } from "../scaffold-scene-snapshot-view";
import { ScaffoldSceneappRunnerView } from "..";

interface Props {
  scene: SceneRecord;
  mode: "design" | "run";
  // import { ScenePreviewParams } from "@base-sdk/base/features/scene-preview";
  // TODO: declare type
  appRunnerConfig?: any;
}

export function ScaffoldSceneView(props: Props) {
  if (props.mode === "run" && !!!props.appRunnerConfig) {
    throw "mode is run but config is empty";
  }

  function DesignMode() {
    return (
      <>
        <ScaffoldSceneSnapshotView
          width={props.scene.width}
          height={props.scene.height}
          previewUrl={props.scene.preview}
        />
      </>
    );
  }

  function RunMode() {
    return (
      <>
        <ScaffoldSceneappRunnerView data={props.appRunnerConfig} />
      </>
    );
  }

  return <>{props.mode === "design" ? DesignMode() : RunMode()}</>;
}
