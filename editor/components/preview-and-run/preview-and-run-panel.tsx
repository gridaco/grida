import styled from "@emotion/styled";
import { Tab } from "@material-ui/core";
import React, { useEffect, useState } from "react";
import { AppRunner } from "../app-runner";
import { ScenePreview } from "../scene-preview";

type Mode = "preview" | "run";

interface SceneRunnerConfig {
  fileid: string;
  sceneid: string;
  sceneSize: {
    w: number;
    h: number;
  };
  src: string | (() => string);
  platform: "web" | "flutter";
  componentName: string;
}

export function PreviewAndRunPanel(props: { config: SceneRunnerConfig }) {
  const [mode, setmode] = useState<Mode>("preview");
  const sceneConfig = props.config;

  const loadSource = () => {
    if (typeof props.config.src == "string") {
      return props.config.src;
    } else if (typeof props.config.src == "function") {
      return props.config.src();
    } else {
      return "// loading...";
    }
  };

  const TargetModePanel = () => {
    const _width = "100%";
    const _height = "100%";
    switch (mode) {
      case "preview":
        return (
          <ScenePreview
            config={{
              fileid: sceneConfig?.fileid,
              sceneid: sceneConfig?.sceneid,
              origin: "figma",
              displayAs: "embed",
            }}
            width={_width}
            height={_height}
          />
        );
      case "run":
        return (
          <>
            <AppRunner
              componentName={sceneConfig.componentName}
              sceneSize={sceneConfig?.sceneSize}
              src={loadSource()}
              platform={sceneConfig?.platform}
            />
          </>
        );
    }
  };

  const ModeSelectionTab = () => {
    const clicked = (mode: Mode) => {
      return () => {
        setmode(mode);
      };
    };
    return (
      <>
        <button onClick={clicked("preview")}>Preview</button>
        <button onClick={clicked("run")}>Run</button>
      </>
    );
  };

  return (
    <div style={{ height: "100%" }}>
      <StickyTab>
        <ModeSelectionTab />
      </StickyTab>
      <TargetModePanel />
    </div>
  );
}

const StickyTab = styled.div`
  position: relative;
`;
