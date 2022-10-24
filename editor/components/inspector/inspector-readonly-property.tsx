import styled from "@emotion/styled";
import React from "react";

export function ReadonlyProperty({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | string;
  unit?: "px";
}) {
  const snippet = pretty(value, unit);
  const onclick = () => {
    navigator.clipboard.writeText(snippet);
  };

  return (
    <PropertyLineContainer onClick={onclick}>
      <label>{label}</label>
      <span title={`raw: ${value}`}>{snippet}</span>
    </PropertyLineContainer>
  );
}

const pretty = (value: number | string, unit?: "px" | any): string => {
  switch (unit) {
    case "px":
      // round to 2 decimals
      return Math.round((value as number) * 100) / 100 + "px";
    default:
      return value?.toString() || "";
  }
};

const PropertyLineContainer = styled.div`
  display: flex;
  flex: 1;
  gap: 8px;
  background: transparent;
  padding: 2px;

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
    background: rgba(255, 255, 255, 0.1);
  }

  cursor: pointer;
  &:active {
    background: rgba(255, 255, 255, 0.2);
  }
`;
