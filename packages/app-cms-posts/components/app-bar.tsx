import React from "react";
import styled from "@emotion/styled";
import { SavingIndicator } from "@grida.co/app/components/saving-indicator";

const publish_mode_labels = {
  update: "Publish changes",
  post: "Publish",
};

export function RightActionBar({
  saving,
  mode,
  onPreviewClick,
  onPublishClick,
  disabled = false,
}: {
  saving?: "saving" | "saved" | "error" | undefined;
  mode: "update" | "post";
  disabled?: boolean;
  onPreviewClick: () => void;
  onPublishClick: () => void;
}) {
  return (
    <Root>
      {saving && <SavingIndicator status={saving} />}
      <CancelButton onClick={onPreviewClick}>Preview</CancelButton>
      <PublishButton onClick={onPublishClick} disabled={disabled}>
        {publish_mode_labels[mode] ?? publish_mode_labels.post}
      </PublishButton>
    </Root>
  );
}

const Root = styled.div`
  position: fixed;
  inset: 0;
  z-index: 9;
  user-select: none;
  display: flex;
  justify-content: flex-end;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  align-self: stretch;
  height: 56px;
  box-sizing: border-box;
  padding-left: 16px;
  padding-right: 20px;
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
