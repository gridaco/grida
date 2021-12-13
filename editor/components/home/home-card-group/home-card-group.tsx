import React from "react";
import styled from "@emotion/styled";
import { HomeSceneCardGoupHeader } from "./home-card-group-header";

export function HomeCardGroup({
  label,
  cards,
}: {
  label: string;
  cards: React.ReactNode[];
}) {
  return (
    <RootWrapperGroup>
      <HomeSceneCardGoupHeader label={label} />
      <Cards>{cards.map((card) => card)}</Cards>
    </RootWrapperGroup>
  );
}

const RootWrapperGroup = styled.div`
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
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: 1;
  gap: 20px;
  align-self: stretch;
  box-sizing: border-box;
`;
