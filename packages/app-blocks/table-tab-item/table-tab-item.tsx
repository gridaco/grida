import React from "react";
import styled from "@emotion/styled";

export function TableTabItem({
  icon,
  children = <>Tab Item</>,
  selected = false,
}: {
  icon?: React.ReactNode;
  /**
   * label
   */
  children: React.ReactNode;
  selected?: boolean;
}) {
  return (
    <Container>
      <TopSpacer />
      <HoverEffectContainer>
        {icon ? <IconContainer>{icon}</IconContainer> : <></>}
        <Label>{children}</Label>
      </HoverEffectContainer>
      {selected ? <Indicator /> : <></>}
    </Container>
  );
}

const Container = styled.div`
  display: flex;
  justify-content: space-between;
  flex-direction: column;
  align-items: flex-start;
  flex: none;
  box-sizing: border-box;
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

const Indicator = styled.div`
  height: 1px;
  background-color: black;
  align-self: stretch;
  flex-shrink: 0;
`;
