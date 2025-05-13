import styled from "@emotion/styled";
import React, { useState } from "react";
import { AppRunner } from "components/app-runner";
import { DesignPreview } from "components/design-preview";

type Mode = "preview" | "run";

interface SceneRunnerConfig {
  fileid: string;
  sceneid: string;
  sceneSize: {
    w: number;
    h: number;
  };
  src: string | (() => string);
  platform: "react" | "flutter" | "vanilla" | "vue" | "svelte";
  componentName: string;
  initialMode?: Mode;
  hideModeChangeControls?: boolean;
}

export function PreviewAndRunPanel(props: { config: SceneRunnerConfig }) {
  const [mode, setmode] = useState<Mode>(
    props.config?.initialMode || "preview"
  );
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
          <DesignPreview
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
    <div>
      {props.config.hideModeChangeControls ? null : (
        <>
          <StickyTab>
            <ModeSelectionTab />
          </StickyTab>
        </>
      )}
      <TargetModePanelWrap>
        <TargetModePanel />
      </TargetModePanelWrap>
    </div>
  );
}

const StickyTab = styled.div`
  position: relative;
`;

const TargetModePanelWrap = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
`;
