import styled from "@emotion/styled";
import React, { CSSProperties } from "react";
import { copy } from "utils/clipboard";

export function PropertyContainer({
  children,
  disabled,
  onClick,
  background,
}: React.PropsWithChildren<{
  onClick?: () => void;
  disabled?: boolean;
  background?: CSSProperties["background"];
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
  padding: 4px;
  border-radius: 4px;

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

export function ReadonlyProperty({
  label,
  value,
  unit,
  hideEmpty,
}: {
  label: string;
  value: number | string;
  unit?: "px" | "%";
  hideEmpty?: boolean;
}) {
  const snippet = pretty(value, unit);
  const onclick = () => {
    copy(snippet, { notify: true });
  };

  if (hideEmpty && !value) {
    return <></>;
  }

  return (
    <PropertyContainer onClick={onclick}>
      <label>{label}</label>
      <span title={`raw: ${value}`}>{snippet}</span>
    </PropertyContainer>
  );
}

// round to 2 decimals
const rd = (d) => Math.round((d as number) * 100) / 100;

const pretty = (value: number | string, unit?: "px" | "%"): string => {
  switch (unit) {
    case "px":
      return rd(value) + "px";
    case "%":
      return rd(value) + "%";
    default:
      return value?.toString() || "";
  }
};
