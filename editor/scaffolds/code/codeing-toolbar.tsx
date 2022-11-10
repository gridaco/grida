import React from "react";
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

export function CodingToolbar({
  onCloseClick,
  onDownloadClick,
  onOpenPreferencesClick,
}: {
  onCloseClick: () => void;
  onOpenPreferencesClick: () => void;
  onDownloadClick: () => void;
}) {
  return (
    <CodingBarContainer>
      <div className="leading">
        <Tooltip content={"Close"}>
          <IconButton onClick={onCloseClick}>
            <Cross1Icon />
          </IconButton>
        </Tooltip>
        <div style={{ width: 10 }} />
        <SceneLabel style={{}}>/homescreen</SceneLabel>
        <CodingEditorTabs />
      </div>
      <div className="trailing">
        {/* TODO: add actions */}
        <Tooltip content={"Framework config"}>
          <IconButton onClick={onOpenPreferencesClick}>
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
  const [selection, setSelection] = React.useState();

  const { code } = state;

  const onselect = (id) => {
    setSelection(id);
  };

  return (
    <Tabs>
      {Object.values(code.files).map(({ name, path }) => (
        <Filetab
          key={path}
          onClick={() => onselect(path)}
          placed
          selected={selection === path}
        >
          {name}
        </Filetab>
      ))}
    </Tabs>
  );
}

const Tabs = styled.div`
  display: flex;
  flex-direction: row;
  gap: 4px;
`;
