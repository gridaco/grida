import React from "react";
import styled from "@emotion/styled";
import { TabBadge } from "../tab-badge";

export function DevtoolsTab({
  label,
  badge,
  selected,
  onTap,
}: {
  selected?: boolean;
  label: string;
  badge?: string | number;
  onTap?: () => void;
}) {
  return (
    <TabBase onClick={onTap}>
      <Label data-selected={selected}>{label}</Label>
      <TabBadge value={badge} />
    </TabBase>
  );
}

const TabBase = styled.div`
  cursor: pointer;
  user-select: none;
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
`;

const Label = styled.span`
  color: rgb(151, 151, 151);
  text-overflow: ellipsis;
  font-size: 12px;
  font-family: Inter, sans-serif;
  font-weight: 400;
  text-align: left;

  &:hover {
    color: white;
  }

  &[data-selected="true"] {
    color: white;
  }
`;
