import React from "react";
import styled from "@emotion/styled";

export function TableTabItem({
  icon,
  children = <>Tab Item</>,
  selected = false,
  badge = null,
  onClick,
}: {
  icon?: React.ReactNode;
  /**
   * label
   */
  children: React.ReactNode;
  selected?: boolean;
  badge?: string | number;
  onClick?: () => void;
}) {
  return (
    <Container onClick={onClick}>
      <TopSpacer />
      <HoverEffectContainer>
        {icon ? <IconContainer>{icon}</IconContainer> : <></>}
        <Label>{children}</Label>
        {badge && <Badge>{badge}</Badge>}
      </HoverEffectContainer>
      <Indicator color={selected ? "black" : "transparent"} />
    </Container>
  );
}

const Container = styled.div`
  user-select: none;
  display: flex;
  justify-content: space-between;
  flex-direction: column;
  align-items: flex-start;
  flex: none;
  box-sizing: border-box;
  align-self: stretch;
`;

const TopSpacer = styled.div`
  height: 2px;
  align-self: stretch;
  flex-shrink: 0;
`;

const HoverEffectContainer = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  border-radius: 4px;
  align-self: stretch;
  box-sizing: border-box;
  padding: 6px 8px;
  flex-shrink: 0;

  :hover {
    background-color: rgba(0, 0, 0, 0.05);
  }
`;

const IconContainer = styled.div`
  width: 16px;
  height: 16px;
`;

const Label = styled.span`
  color: black;
  text-overflow: ellipsis;
  font-size: 16px;
  font-family: Inter, sans-serif;
  font-weight: 600;
  text-align: left;
`;

const Indicator = styled.div<{ color: "black" | "transparent" }>`
  height: 1px;
  background-color: ${({ color }) => color};
  align-self: stretch;
  flex-shrink: 0;
`;

const Badge = styled.div`
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 100px;
  padding: 4px 6px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  text-align: center;
  color: rgb(0, 0, 0);
  box-sizing: border-box;
`;
