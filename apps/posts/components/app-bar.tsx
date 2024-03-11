import React from "react";
import styled from "@emotion/styled";
import { SavingIndicator } from "./saving-indocator";
import { RoundPrimaryButton } from "../components";

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
}

export function RightActionBar({
  saving,
  mode,
  onPreviewClick,
  onPublishClick,
  disabledPublish: disabled = false,
}: RightActionBarProps) {
  return (
    <RightActionBarContainer>
      {saving && <SavingIndicator status={saving} />}
      <PreviewButton onClick={onPreviewClick}>Preview</PreviewButton>
      <RoundPrimaryButton onClick={onPublishClick} disabled={disabled}>
        {publish_mode_labels[mode] ?? publish_mode_labels.post}
      </RoundPrimaryButton>
      {/* <PreviewButton onClick={onPreviewClick}>...</PreviewButton> */}
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

interface BreadcrumbProps {
  logo?: React.ReactElement;
  onLogoClick?: () => void;
}

export function Breadcrumb({ logo, onLogoClick }: BreadcrumbProps) {
  return (
    <BreadcrumbContainer>
      {logo ? (
        <LogoButton title="Home" onClick={onLogoClick} href="/posts">
          {logo}
        </LogoButton>
      ) : (
        <></>
      )}
    </BreadcrumbContainer>
  );
}

const BreadcrumbContainer = styled.div`
  display: flex;
`;

const LogoButton = styled.a`
  user-select: none;
  cursor: pointer;
  outline: none;
  border: none;
  background-color: transparent;
  height: 100%;
  max-height: 32px;
  padding: 4px 8px;
  max-width: 160px;
  margin-top: auto;
  margin-bottom: auto;
  border-radius: 4px;

  img {
    pointer-events: none;
  }

  :hover {
    background-color: rgba(0, 0, 0, 0.1);
  }

  :active {
    background-color: rgba(0, 0, 0, 0.2);
  }

  transition: background-color 0.2s ease-in-out;
`;
