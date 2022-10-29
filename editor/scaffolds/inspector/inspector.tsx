import React, { useState } from "react";
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

type Tab = "inspect" | "threads";

export function Inspector() {
  const { target } = useTargetContainer();
  const [state] = useEditorState();
  const [tab, setTab] = useState<Tab>("inspect");

  if (target) {
    return (
      <InspectorContainer>
        <Tabs selectedTab={tab} onTabChange={setTab} />
        <InfoSection />
        <div style={{ height: 16 }} />
        <Body type={tab} />
      </InspectorContainer>
    );
  }

  return <></>;
}

function Body({ type }: { type: Tab }) {
  switch (type) {
    case "inspect":
      return <InspectorBody />;
    case "threads":
      return <ConversationsBody />;
  }
}

function ConversationsBody() {
  return <Conversations />;
}

function InspectorBody() {
  return (
    <>
      <LayoutSection />
      <ColorsSection />
      <AssetsSection />
      <TypographySection />
      <ContentSection />
      <CodeSection />
    </>
  );
}

function Tabs({
  onTabChange,
  selectedTab,
}: {
  selectedTab: string;
  onTabChange: (tab: Tab) => void;
}) {
  return (
    <TabsContainer>
      <Tab
        selected={selectedTab === "inspect"}
        onClick={() => {
          onTabChange("inspect");
        }}
      >
        Inspect
      </Tab>
      <Tab
        selected={selectedTab === "threads"}
        onClick={() => {
          onTabChange("threads");
        }}
      >
        Conversations
      </Tab>
    </TabsContainer>
  );
}

const TabsContainer = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding: 8px;
`;

function Tab({
  selected,
  onClick,
  children,
}: React.PropsWithChildren<{
  selected?: boolean;
  onClick: () => void;
}>) {
  const [hover, setHover] = useState(false);

  return (
    <TabContainer
      data-selected={selected}
      onClick={onClick}
      data-hover={hover}
      onMouseEnter={() => {
        setHover(true);
      }}
      onMouseLeave={() => {
        setHover(false);
      }}
    >
      {children}
    </TabContainer>
  );
}

const TabContainer = styled.label`
  padding: 4px;
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.5);
  &[data-selected="true"] {
    color: white;
  }

  &[data-hover="true"] {
    color: rgba(255, 255, 255, 0.8);
    background: rgba(255, 255, 255, 0.1);
  }
`;

const InspectorContainer = styled.div`
  display: flex;
  z-index: 1;
  overflow-y: scroll;
  flex-direction: column;
  height: 100%;
  background-color: ${colors.color_editor_bg_on_dark};
`;
/* background-color: ${(props) => props.theme.colors.background}; */
