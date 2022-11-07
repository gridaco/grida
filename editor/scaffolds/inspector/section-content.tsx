import React from "react";
import styled from "@emotion/styled";
import {
  PropertyLine,
  PropertyGroup,
  PropertyGroupHeader,
} from "@editor-ui/property";
import { useTargetContainer } from "hooks/use-target-node";
import { copy } from "utils/clipboard";

export function ContentSection() {
  const { target } = useTargetContainer();

  if (target?.type === "TEXT") {
    const txt = target.data;

    return (
      <PropertyGroup>
        <PropertyGroupHeader>
          <h6>Content</h6>
        </PropertyGroupHeader>
        <PropertyLine>
          <ClipboardBox
            background="rgba(255, 255, 255, 0.1)"
            onClick={() => {
              copy(txt, { notify: true });
            }}
          >
            <TextContentContainer>{txt}</TextContentContainer>
          </ClipboardBox>
        </PropertyLine>
      </PropertyGroup>
    );
  } else {
    return <></>;
  }
}

const TextContentContainer = styled.div`
  display: flex;
  padding: 8px;
  color: white;
  word-break: break-word;
  font-size: 12px;
  width: 100%;
`;

function ClipboardBox({
  children,
  disabled,
  onClick,
  background,
}: React.PropsWithChildren<{
  onClick?: () => void;
  disabled?: boolean;
  background?: React.CSSProperties["background"];
}>) {
  return (
    <PropertyLineContainer
      onClick={onClick}
      data-disabled={disabled}
      style={{
        background,
      }}
    >
      {children}
    </PropertyLineContainer>
  );
}

const PropertyLineContainer = styled.div`
  display: flex;
  flex: 1;
  gap: 8px;
  background: transparent;
  padding: 8px;

  label {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.5);
  }

  span {
    font-size: 14px;
    color: white;
  }

  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.1) !important;
  }

  cursor: pointer;
  &:active {
    background: rgba(255, 255, 255, 0.2) !important;
  }

  &[data-disabled="true"] {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
