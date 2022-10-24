import React from "react";
import styled from "@emotion/styled";
import { InspectorSection } from "components/inspector";
import { useTargetContainer } from "hooks/use-target-node";

export function ContentSection() {
  const { target } = useTargetContainer();

  if (target?.type === "TEXT") {
    return (
      <InspectorSection label="Content">
        <TextContentContainer>{target.data}</TextContentContainer>
      </InspectorSection>
    );
  } else {
    return <></>;
  }
}

const TextContentContainer = styled.div`
  display: flex;
  padding: 8px;
  color: white;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.1);
`;
