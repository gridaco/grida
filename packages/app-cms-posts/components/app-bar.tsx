import React from "react";
import styled from "@emotion/styled";
import { SavingIndicator } from "@grida.co/app/components/saving-indicator";

const publish_mode_labels = {
  update: "Publish changes",
  post: "Publish",
};

export function Appbar({ ...props }: RightActionBarProps & BreadcrumbProps) {
  return (
    <Root>
      <Breadcrumb {...props} />
      <Spacer />
      <RightActionBar {...props} />
    </Root>
  );
}

const Root = styled.div`
  display: flex;
  position: fixed;
  user-select: none;
  z-index: 9;
  inset: 0;
  padding-left: 16px;
  padding-right: 20px;
  flex-shrink: 0;
  align-self: stretch;
  height: 56px;
  box-sizing: border-box;
  background: white;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
`;

const Spacer = styled.div`
  flex: 1;
`;

interface RightActionBarProps {
  saving?: "saving" | "saved" | "error" | undefined;
  mode: "update" | "post";
  disabledPublish?: boolean;
  onPreviewClick: () => void;
  onPublishClick: () => void;
  theme?: {
    primaryButton?: {
      backgroundColor?: React.CSSProperties["color"];
      borderRadius?: React.CSSProperties["borderRadius"];
    };
  };
}

export function RightActionBar({
  saving,
  mode,
  onPreviewClick,
  onPublishClick,
  disabledPublish: disabled = false,
  theme,
}: RightActionBarProps) {
  return (
    <RightActionBarContainer>
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
    </RightActionBarContainer>
  );
}

const RightActionBarContainer = styled.div`
  display: flex;
  justify-content: flex-end;
  flex-direction: row;
  align-items: center;
  gap: 8px;
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

interface BreadcrumbProps {
  logo?: React.ReactElement;
  onLogoClick?: () => void;
}

export function Breadcrumb({ logo, onLogoClick }: BreadcrumbProps) {
  return (
    <BreadcrumbContainer>
      {logo ? <LogoButton onClick={onLogoClick}>{logo}</LogoButton> : <></>}
    </BreadcrumbContainer>
  );
}

const BreadcrumbContainer = styled.div`
  display: flex;
`;

const LogoButton = styled.button`
  cursor: pointer;
  outline: none;
  border: none;
  background-color: transparent;
  height: 24px;
  max-width: 160px;
  margin-top: auto;
  margin-bottom: auto;
`;
