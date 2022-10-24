import React from "react";
import styled from "@emotion/styled";
import { InspectorSection, PropertyContainer } from "components/inspector";
import { useTargetContainer } from "hooks/use-target-node";
import { copy } from "utils/clipboard";

export function ContentSection() {
  const { target } = useTargetContainer();

  if (target?.type === "TEXT") {
    const txt = target.data;

    return (
      <InspectorSection label="Content">
        <PropertyContainer
          background="rgba(255, 255, 255, 0.1)"
          onClick={() => {
            copy(txt, { notify: true });
          }}
        >
          <TextContentContainer>{txt}</TextContentContainer>
        </PropertyContainer>
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
  width: 100%;
`;
