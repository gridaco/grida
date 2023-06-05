import React from "react";
import styled from "@emotion/styled";
import {
  SquareIcon,
  ViewVerticalIcon,
  Link1Icon,
  LinkNone1Icon,
  ExitIcon,
} from "@radix-ui/react-icons";
import { IconButton, IconToggleButton } from "@code-editor/ui";

export function Toolbar() {
  // 1. comment
  // 3. zoom
  // 4. export

  return (
    <div data-wtf="editor-isolated-inspection-toolbar">
      <ToolbarPositioner>
        <ToolbarContainer>
          <IconToggleButton on={<SquareIcon />} off={<ViewVerticalIcon />} />
          <IconToggleButton on={<Link1Icon />} off={<LinkNone1Icon />} />
          <IconButton>
            <ExitIcon />
          </IconButton>
        </ToolbarContainer>
      </ToolbarPositioner>
    </div>
  );
}

const ToolbarPositioner = styled.div`
  pointer-events: none;
  z-index: 9;

  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;

  display: flex;
  align-items: center;
  justify-content: center;
`;

const ToolbarContainer = styled.div`
  pointer-events: all;
  margin: 24px;

  display: flex;
  align-items: center;

  color: white;
  border-radius: 4px;
  background-color: rgba(0, 0, 0, 0.9);
  padding: 4px;
  gap: 4px;
`;
