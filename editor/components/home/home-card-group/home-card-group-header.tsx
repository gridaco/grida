import React from "react";
import styled from "@emotion/styled";
import Link from "next/link";
export function HomeSceneCardGoupHeader({
  label,
  action,
  onAction,
  anchor,
}: {
  label: string;
  onAction?: () => void;
  action?: string;
  anchor?: string;
}) {
  const Content = (
    <RootWrapperBaseHomeSceneCardGoupHeader>
      <Label>{label}</Label>
      {action && <Action onClick={onAction}>{action}</Action>}
    </RootWrapperBaseHomeSceneCardGoupHeader>
  );

  return anchor ? <Link href={anchor}>{Content}</Link> : Content;
}

const RootWrapperBaseHomeSceneCardGoupHeader = styled.div`
  cursor: pointer;
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: center;
  flex: 1;
  align-self: stretch;
  box-sizing: border-box;
`;

const Label = styled.span`
  color: rgba(255, 255, 255, 1);
  text-overflow: ellipsis;
  font-size: 21px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
  flex: 1;
`;

const Action = styled.span`
  color: rgba(255, 255, 255, 1);
  text-overflow: ellipsis;
  font-size: 16px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
  opacity: 0.2;
`;
