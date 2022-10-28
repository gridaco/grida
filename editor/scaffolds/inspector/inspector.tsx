import React from "react";
import styled from "@emotion/styled";
import { useEditorState } from "core/states";
import { colors } from "theme";
import { useTargetContainer } from "hooks/use-target-node";

import { InfoSection } from "./section-info";
import { LayoutSection } from "./section-layout";
import { ColorsSection } from "./section-colors";
import { ContentSection } from "./section-content";
import { TypographySection } from "./section-typography";
import { AssetsSection } from "./section-assets";
import { CodeSection } from "./section-code";
import { Conversations } from "scaffolds/conversations";

export function Inspector() {
  const { target } = useTargetContainer();
  const [state] = useEditorState();

  if (target) {
    return (
      <InspectorContainer>
        <Conversations />
        <InfoSection />
        <div style={{ height: 16 }} />
        <LayoutSection />
        <ColorsSection />
        <AssetsSection />
        <TypographySection />
        <ContentSection />
        <CodeSection />
      </InspectorContainer>
    );
  }

  return <></>;
}

const InspectorContainer = styled.div`
  display: flex;
  z-index: 1;
  overflow-y: scroll;
  flex-direction: column;
  height: 100%;
  background-color: ${colors.color_editor_bg_on_dark};
`;
/* background-color: ${(props) => props.theme.colors.background}; */
