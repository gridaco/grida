import { SceneRecord } from "@base-sdk/scene-store";
import { QuicklookQueryParams } from "@base-sdk/base/features/quicklook";
import React, { useEffect } from "react";
import { ScaffoldSceneSnapshotView } from "../scaffold-scene-snapshot-view";

interface Props {
  scene: SceneRecord;
  mode: "design" | "run";
  appRunnerConfig?: QuicklookQueryParams;
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
    return <></>;
  }

  return <>{props.mode === "design" ? designMode() : runMode()}</>;
}
