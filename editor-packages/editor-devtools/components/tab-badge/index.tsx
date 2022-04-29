import React from "react";
import styled from "@emotion/styled";

const bgcolortypemap = {
  default: "rgba(255, 255, 255, 0.1)",
  warning: "rgba(255, 230, 0, 0.1)",
  error: "rgba(255, 0, 0, 0.1)",
};

export function TabBadge({
  type = "default",
  value,
}: {
  type?: "default" | "warning" | "error";
  value: string | number;
}) {
  const background = bgcolortypemap[type];

  if (value === undefined || value === null) {
    return <></>;
  }

  return (
    <BaseDevtoolsTabBadge background={background}>
      <Value>{value}</Value>
    </BaseDevtoolsTabBadge>
  );
}

const Value = styled.span`
  color: rgb(151, 151, 151);
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
