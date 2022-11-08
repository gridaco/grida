import styled from "@emotion/styled";
import { SceneNodeIcon } from "components/icons";
import { useTargetContainer } from "hooks/use-target-node";

import React from "react";
export function InfoSection() {
  const { target } = useTargetContainer();

  if (!target) {
    return <></>;
  }

  const { type, name } = target;
  return (
    <Section>
      <SceneTitle>
        <SceneNodeIcon color="white" type={type} />
        <input disabled value={name} />
      </SceneTitle>
      {/* <SceneDescription>{"No description"}</SceneDescription> */}
    </Section>
  );
}

const Section = styled.section`
  display: flex;
  flex-direction: column;
  padding: 14px;
`;

const SceneTitle = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  cursor: default;
  font-weight: normal;

  input {
    margin: 0;
    width: 100%;
    background: transparent;
    font-size: 16px;
    font-weight: 600;
    outline: none;
    border: none;
    color: rgba(255, 255, 255, 0.8);
  }
`;

const SceneDescription = styled.p`
  margin: 0;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.5);
`;
