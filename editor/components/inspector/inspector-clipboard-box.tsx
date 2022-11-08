import React from "react";
import styled from "@emotion/styled";

export function ClipboardBox({
  children,
  disabled,
  onClick,
  background,
  borderRadius,
  singleline,
}: React.PropsWithChildren<{
  onClick?: () => void;
  disabled?: boolean;
  background?: React.CSSProperties["background"];
  borderRadius?: React.CSSProperties["borderRadius"];
  singleline?: boolean;
}>) {
  return (
    <PropertyLineContainer
      onClick={onClick}
      data-disabled={disabled}
      style={{
        background,
        borderRadius,
        whiteSpace: singleline ? "nowrap" : "normal",
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
  padding: 8px 10px;
  overflow-x: scroll;

  ::-webkit-scrollbar {
    display: none;
  }

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
