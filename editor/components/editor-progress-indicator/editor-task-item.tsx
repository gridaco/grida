import React from "react";
import styled from "@emotion/styled";
import LinearProgress from "@mui/material/LinearProgress";

export function EditorTaskItem({
  label,
  description,
  progress,
}: {
  label: string;
  description?: string;
  progress: number | null;
}) {
  return (
    <RootWrapperProgressingItemReadonly>
      <TitleAndValueContainer>
        <ThisLabel>{label}</ThisLabel>
        <ColoredLinearProgress value={progress} />
      </TitleAndValueContainer>
      <ThisDescription>{description}</ThisDescription>
    </RootWrapperProgressingItemReadonly>
  );
}

const RootWrapperProgressingItemReadonly = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: flex-start;
  flex: none;
  gap: 4px;
  box-sizing: border-box;
`;

const TitleAndValueContainer = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  align-self: stretch;
  box-sizing: border-box;
  flex-shrink: 0;
`;

const ThisLabel = styled.span`
  color: white;
  text-overflow: ellipsis;
  font-size: 12px;
  font-family: Roboto, sans-serif;
  font-weight: 400;
  text-align: left;
  width: 80px;
`;

const ColoredLinearProgress = styled(LinearProgress)`
  height: 4px;
  width: 203px;
  border-radius: 7px;
  background-color: rgb(37, 98, 255);
`;

const ThisDescription = styled.span`
  color: rgba(255, 255, 255, 0.5);
  text-overflow: ellipsis;
  font-size: 10px;
  font-weight: 400;
  text-align: left;
  align-self: stretch;
  flex-shrink: 0;
`;
