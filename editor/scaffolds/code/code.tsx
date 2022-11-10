import React, { useCallback, useState } from "react";
import styled from "@emotion/styled";
import { WorkspaceContentPanel } from "layouts/panel";
import { useDispatch } from "core/dispatch";
import { Coding } from "./coding";
import { CodeRunnerCanvas } from "./code-runner-canvas";
import {
  Cross1Icon,
  GearIcon,
  DownloadIcon,
  DotsHorizontalIcon,
} from "@radix-ui/react-icons";
import { Tooltip } from "@editor-ui/tooltip";
import { useDispatch as usePreferencesDispatch } from "@code-editor/preferences";
import { downloadFile } from "utils/download";

export function Code() {
  const dispatch = useDispatch();
  const preferencesDispatch = usePreferencesDispatch();
  const [code, setCode] = useState("");

  const startFullscreenRunnerMode = useCallback(
    () =>
      dispatch({
        type: "mode",
        mode: "run",
      }),
    [dispatch]
  );

  const endCodeSession = useCallback(
    () =>
      dispatch({
        type: "mode",
        mode: "design",
      }),
    [dispatch]
  );

  const openPreferences = useCallback(() => {
    preferencesDispatch({ type: "open", route: "/framework" });
  }, [preferencesDispatch]);

  const onDownloadClick = () => {
    // support non tsx files
    downloadFile({ data: code, filename: "draft.tsx" });
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <WorkspaceContentPanel
        disableBorder
        overflow={"hidden"}
        resize={{
          right: true,
        }}
        minWidth={100}
      >
        <div>
          <CodingBarContainer>
            <div className="leading">
              <Tooltip content={"Close"}>
                <IconButton onClick={endCodeSession}>
                  <Cross1Icon />
                </IconButton>
              </Tooltip>
            </div>
            <div className="trailing">
              {/* TODO: add actions */}
              <Tooltip content={"Framework config"}>
                <IconButton onClick={openPreferences}>
                  <GearIcon />
                </IconButton>
              </Tooltip>
              <Tooltip content={"Download file"}>
                <IconButton onClick={onDownloadClick}>
                  <DownloadIcon />
                </IconButton>
              </Tooltip>
              <IconButton>
                <DotsHorizontalIcon />
              </IconButton>
            </div>
          </CodingBarContainer>
          <Coding onChange={setCode} />
        </div>
      </WorkspaceContentPanel>
      <WorkspaceContentPanel disableBorder>
        <CodeRunnerCanvas onEnterFullscreen={startFullscreenRunnerMode} />
      </WorkspaceContentPanel>
    </div>
  );
}

const CodingBarContainer = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
  padding: 16px;

  .leading {
    display: flex;
    flex-direction: row;
    margin-right: auto;
  }

  .trailing {
    display: flex;
    flex-direction: row;
    margin-left: auto;
  }
`;

const IconButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  border-radius: 4px;
  color: white;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  &:active {
    background: rgba(255, 255, 255, 0.2);
  }

  &:focus {
    outline: 1px solid rgba(255, 255, 255, 0.5);
  }
`;
