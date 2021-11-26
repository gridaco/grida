import styled from "@emotion/styled";
import React from "react";

import { CodeIcon, NamedCodeIcons } from "./code-icon";

const DEFAULT_LABEL_TEXT = "File name.txt";

export default function VSCodeTab({
  selected = false,
  label = DEFAULT_LABEL_TEXT,
  icon = "dummy",
  onClick,
}: {
  selected?: boolean;
  icon?: NamedCodeIcons;
  label?: string;
  onClick?: () => void;
}) {
  return (
    <Wrapper onClick={onClick}>
      <BaseVscodeTab
        color={selected ? BaseColors.selected : BaseColors.unselected}
      >
        <LabelArea>
          <CodeIcon icon={icon} />
          <Label
            color={selected ? LabelColors.selected : LabelColors.unselected}
          >
            {label}
          </Label>
        </LabelArea>
      </BaseVscodeTab>
    </Wrapper>
  );
}

const LabelColors = {
  selected: `rgba(254, 254, 254, 1)`,
  unselected: `rgba(119, 119, 119, 1)`,
};

const BaseColors = {
  selected: `rgba(30, 30, 30, 1)`,
  hover: `rgba(30, 30, 30, 1)`,
  unselected: `rgba(45, 45, 45, 1)`,
};

const Wrapper = styled.div`
  cursor: pointer;
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 0;
  box-sizing: border-box;
`;

const BaseVscodeTab = styled.div<{ color: string }>`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 10px;
  width: 135px;
  height: 36px;
  background-color: ${p => p.color};
  :hover {
    background-color: ${BaseColors.hover};
  }
  box-sizing: border-box;
  padding: 14px 20px;
`;

const LabelArea = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 8px;
  width: 95px;
  height: 16px;
  box-sizing: border-box;
`;

const Label = styled.span<{ color: string }>`
  color: ${p => p.color};
  text-overflow: ellipsis;
  font-size: 13px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
`;
