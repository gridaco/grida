import React from "react";
import styled from "@emotion/styled";
import { HomeSceneCardGoupHeader } from "./home-card-group-header";

export function HomeCardGroup({
  label,
  anchor,
  cards,
}: {
  label?: string;
  anchor?: string;
  cards: React.ReactNode[];
}) {
  return (
    <RootWrapperGroup id={anchor?.replace("#", "")}>
      {label && <HomeSceneCardGoupHeader label={label} anchor={anchor} />}
      <Cards>{cards.map((card) => card)}</Cards>
    </RootWrapperGroup>
  );
}

const RootWrapperGroup = styled.section`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 24px;
  align-self: stretch;
  box-sizing: border-box;
`;

const Cards = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: 1;
  gap: 20px;
  align-self: stretch;
  box-sizing: border-box;
`;
