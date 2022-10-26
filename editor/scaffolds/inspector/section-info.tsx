import styled from "@emotion/styled";
import { useTargetContainer } from "hooks/use-target-node";

import React from "react";
export function InfoSection() {
  const { target } = useTargetContainer();
  return (
    <Section>
      <SceneTitle disabled value={target?.name} />
      <SceneDescription>{"No description"}</SceneDescription>
    </Section>
  );
}

const Section = styled.section`
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  padding: 14px;
`;

const SceneTitle = styled.input`
  margin: 4px 0;
  background: transparent;
  font-size: 18px;
  outline: none;
  border: none;
  color: white;
  cursor: default;
  font-weight: normal;
`;

const SceneDescription = styled.p`
  margin: 0;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.5);
`;
