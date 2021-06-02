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
}

export function PreviewAndRunPanel(props: { config: SceneRunnerConfig }) {
  const [mode, setmode] = useState<Mode>("preview");
  const sceneConfig = props.config;

  useEffect(() => {
    // fetch scene config
    // setSceneConfig();
  }, []);

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
    const _width = "375px";
    const _height = undefined;
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
          <AppRunner
            sceneSize={sceneConfig?.sceneSize}
            src={loadSource()}
            platform={sceneConfig?.platform}
          />
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
    <>
      <StickyTab>
        <ModeSelectionTab />
      </StickyTab>
      <TargetModePanel />
    </>
  );
}

const StickyTab = styled.div`
  position: absolute;
`;
