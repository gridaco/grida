import React from "react";
import styled from "@emotion/styled";

export function EditorTaskItem({
  label,
  description,
}: {
  label: string;
  description?: string;
}) {
  return (
    <RootWrapperProgressingItemReadonly>
      <TitleAndValueContainer>
        <ThisLabel>{label}</ThisLabel>
        <ProgressBar>
          <Value />
        </ProgressBar>
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
  min-height: 100vh;
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

const ProgressBar = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: flex-start;
  flex: 1;
  gap: 10px;
  border-radius: 7px;
  width: 203px;
  height: 4px;
  background-color: rgba(255, 255, 255, 0.5);
  box-sizing: border-box;
`;

const Value = styled.div`
  height: 4px;
  background-color: rgb(37, 98, 255);
  border-radius: 4px;
  align-self: stretch;
  flex-shrink: 0;
  flex: 1;
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
