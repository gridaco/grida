import React from "react";
import styled from "@emotion/styled";

const colormap = {
  default: {
    color: "rgba(255, 255, 255, 0.5)",
    bg: "rgba(255, 255, 255, 0.1)",
  },
  warning: {
    color: "rgba(255, 230, 0, 0.5)",
    bg: "rgba(255, 230, 0, 0.1)",
  },
  error: {
    color: "rgba(255, 80, 80, 0.8)",
    bg: "rgba(255, 0, 0, 0.1)",
  },
} as const;

export function TabBadge({
  type = "default",
  value,
}: {
  type?: "default" | "warning" | "error";
  value: string | number;
}) {
  const color = colormap[type].color;
  const background = colormap[type].bg;

  if (value === undefined || value === null) {
    return <></>;
  }

  return (
    <BaseDevtoolsTabBadge background={background}>
      <Value color={color}>{value}</Value>
    </BaseDevtoolsTabBadge>
  );
}

const Value = styled.span<{ color: string }>`
  color: ${(props) => props.color};
  text-overflow: ellipsis;
  font-size: 10px;
  font-family: Inter, sans-serif;
  font-weight: 400;
  text-align: center;
`;

const BaseDevtoolsTabBadge = styled.div<{ background: string }>`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: center;
  flex: none;
  gap: 10px;
  border-radius: 50%;
  width: 18px;
  height: 18px;
  background-color: ${(p) => p.background};
  box-sizing: border-box;
  padding: 10px;
`;
