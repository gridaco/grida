import React from "react";
import styled from "@emotion/styled";
import { SavingIndicator } from "@grida.co/app/components/saving-indicator";

export function RightActionBar({
  saving,
  onCancelClick,
  onPublishClick,
}: {
  saving?: "saving" | "saved" | undefined;
  onCancelClick: () => void;
  onPublishClick: () => void;
}) {
  return (
    <Root>
      {saving && <SavingIndicator status={saving} />}
      <CancelButton onClick={onCancelClick}>Cancel</CancelButton>
      <PublishButton onClick={onPublishClick}>Publish</PublishButton>
    </Root>
  );
}

const Root = styled.div`
  display: flex;
  justify-content: flex-end;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  align-self: stretch;
  height: 56px;
  box-sizing: border-box;
  padding-left: 16px;
  padding-right: 12px;
  flex-shrink: 0;
`;

const CancelButton = styled.button`
  height: 32px;
  background-color: rgb(241, 241, 241);
  border-radius: 20px;
  padding: 0px 12px;
  color: black;
  font-size: 13px;
  font-family: Inter, sans-serif;
  font-weight: 400;
  border: none;
  outline: none;
  cursor: pointer;

  :hover {
    opacity: 0.8;
  }

  :disabled {
    opacity: 0.5;
  }

  :active {
    opacity: 1;
  }

  :focus {
  }
`;

const PublishButton = styled.button`
  height: 32px;
  background-color: rgb(35, 77, 255);
  border-radius: 20px;
  padding: 0px 12px;
  color: white;
  font-size: 13px;
  font-family: Inter, sans-serif;
  font-weight: 400;
  border: none;
  outline: none;
  cursor: pointer;

  :hover {
    opacity: 0.8;
  }

  :disabled {
    opacity: 0.5;
  }

  :active {
    opacity: 1;
  }

  :focus {
  }
`;
