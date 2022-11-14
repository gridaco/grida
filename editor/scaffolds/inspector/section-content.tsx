import React from "react";
import styled from "@emotion/styled";
import {
  PropertyLine,
  PropertyGroup,
  PropertyGroupHeader,
} from "@editor-ui/property";
import { useTargetContainer } from "hooks/use-target-node";
import { copy } from "utils/clipboard";
import { ClipboardBox } from "components/inspector";

export function ContentSection() {
  const { target } = useTargetContainer();

  if (target?.type === "TEXT") {
    const txt = target.data;

    return (
      <PropertyGroup>
        <PropertyGroupHeader>
          <h6>Content</h6>
        </PropertyGroupHeader>
        <PropertyLine>
          <ClipboardBox
            background="rgba(255, 255, 255, 0.1)"
            onClick={() => {
              copy(txt, { notify: true });
            }}
          >
            <TextContentContainer>{txt}</TextContentContainer>
          </ClipboardBox>
        </PropertyLine>
      </PropertyGroup>
    );
  } else {
    return <></>;
  }
}

const TextContentContainer = styled.div`
  display: flex;
  padding: 8px;
  color: white;
  word-break: break-word;
  font-size: 12px;
  width: 100%;
`;
