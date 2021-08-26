import { SceneRecord } from "@base-sdk/scene-store";
import { QuicklookQueryParams } from "@base-sdk/base/features/quicklook";
import React, { useEffect } from "react";
import { ScaffoldSceneSnapshotView } from "../scaffold-scene-snapshot-view";
import { ScaffoldSceneappRunnerView, appRunnerConfig } from "..";

interface Props {
  scene: SceneRecord;
  mode: "design" | "run";
  appRunnerConfig?: appRunnerConfig;
}

export function ScaffoldSceneView(props: Props) {
  useEffect(() => {
    if (props.mode === "run" && !!props.appRunnerConfig) {
      throw "mode is run but config is empty";
    }
  }, []);

  function designMode() {
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

  function runMode() {
    return (
      <>
        <ScaffoldSceneappRunnerView data={props.appRunnerConfig} />
      </>
    );
  }

  return <>{props.mode === "design" ? designMode() : runMode()}</>;
}
