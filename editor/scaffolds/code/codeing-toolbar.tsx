import React, { useCallback, useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import {
  Cross1Icon,
  GearIcon,
  DownloadIcon,
  DotsHorizontalIcon,
} from "@radix-ui/react-icons";
import { Tooltip } from "@editor-ui/tooltip";
import { Filetab } from "./filetab";
import { useEditorState } from "core/states";
import { useDispatch } from "core/dispatch";
import { downloadFile } from "utils/download";
import { useOpenPreferences } from "@code-editor/preferences";
import { useCurrentFile } from "./hooks";
import { useCodingDispatch, useCodingState } from "./coding";

export function CodingToolbar() {
  const file = useCurrentFile();

  const dispatch = useDispatch();

  const endCodeSession = useCallback(
    () =>
      dispatch({
        type: "mode",
        mode: "design",
      }),
    [dispatch]
  );

  const openPreferences = useOpenPreferences();

  const onDownloadClick = () => {
    try {
      // support non tsx files
      downloadFile({ data: file.content, filename: file.name });
    } catch (e) {}
  };

  return (
    <CodingBarContainer>
      <div className="leading">
        <Tooltip content={"Close"}>
          <IconButton onClick={endCodeSession}>
            <Cross1Icon />
          </IconButton>
        </Tooltip>
        <div style={{ width: 10 }} />
        <SceneLabel style={{}}>{"(sandbox)"}</SceneLabel>
        <CodingEditorTabs />
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
  );
}

const SceneLabel = styled.span`
  cursor: default;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-right: 24px;
  max-width: 160px;
  text-overflow: ellipsis;
  overflow: hidden;
`;

const CodingBarContainer = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
  padding: 16px;

  .leading {
    display: flex;
    flex-direction: row;
    align-items: center;
    margin-right: auto;
  }

  .trailing {
    display: flex;
    flex-direction: row;
    align-items: center;
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

function CodingEditorTabs() {
  const [state] = useEditorState();
  const { files } = state.code;
  const dispatch = useDispatch();

  const codingDispatch = useCodingDispatch();

  const { placements, focus } = useCodingState();

  const onselect = (id) => {
    dispatch({
      type: "select-node",
      node: id,
    });
  };

  const tabs =
    // if no focus or already placed, show placements. if not show focus also.
    !focus || placements.includes(focus) ? placements : [...placements, focus];

  return (
    <Tabs>
      {tabs.map((id, ix) => {
        const { path, name } = files[id];
        const placed = placements.includes(id);
        return (
          <Filetab
            key={ix}
            onClick={() => onselect(id)}
            placed={placed}
            onCloseClick={() => {
              codingDispatch({ type: "close", path });
            }}
            onDoubleClick={() => {
              if (!placed) codingDispatch({ type: "place", path });
            }}
            selected={id === focus}
          >
            {name}
          </Filetab>
        );
      })}
    </Tabs>
  );
}

const Tabs = styled.div`
  display: flex;
  flex-direction: row;
  gap: 4px;
`;
