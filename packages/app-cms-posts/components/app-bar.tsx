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
  theme,
}: {
  saving?: "saving" | "saved" | "error" | undefined;
  mode: "update" | "post";
  disabled?: boolean;
  onPreviewClick: () => void;
  onPublishClick: () => void;
  theme?: {
    primaryButton?: {
      backgroundColor?: React.CSSProperties["color"];
      borderRadius?: React.CSSProperties["borderRadius"];
    };
  };
  // primaryColor?: string;
}) {
  return (
    <Root>
      {saving && <SavingIndicator status={saving} />}
      <PreviewButton onClick={onPreviewClick}>Preview</PreviewButton>
      <PublishButton
        backgroundColor={theme?.primaryButton?.backgroundColor}
        borderRadius={theme?.primaryButton?.borderRadius}
        onClick={onPublishClick}
        disabled={disabled}
      >
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

const PreviewButton = styled.button`
  height: 32px;
  background-color: rgba(0, 0, 0, 0.06);
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

const PublishButton = styled.button<{
  backgroundColor?: React.CSSProperties["color"];
  borderRadius?: React.CSSProperties["borderRadius"];
}>`
  height: 32px;
  background-color: ${(props) => props.backgroundColor ?? "rgb(35, 77, 255)"};
  border-radius: ${(props) => props.borderRadius ?? "20px"};
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
