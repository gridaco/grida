import React, { useCallback, useState } from "react";
import styled from "@emotion/styled";
import { EditorState, useEditorState } from "core/states";
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
import { EditorAppbarFragments } from "components/editor";
import { useDispatch } from "core/dispatch";

type Tab = "inspect" | "comment";

export function Inspector() {
  const [state] = useEditorState();
  const dispatch = useDispatch();

  const tab = __mode(state.mode);

  const switchMode = useCallback(
    (mode: Tab) => {
      dispatch({
        type: "mode",
        mode: mode,
      });
    },
    [dispatch]
  );

  return (
    <InspectorContainer>
      <EditorAppbarFragments.RightSidebar flex={0} />
      <Tabs selectedTab={tab} onTabChange={switchMode} />
      <div style={{ height: 16 }} />
      <Body type={tab} />
    </InspectorContainer>
  );
}

const __mode = (mode: EditorState["mode"]): Tab => {
  switch (mode) {
    case "comment":
      return "comment";
    case "inspect":
    default:
      return "inspect";
  }
};

function Body({ type }: { type: Tab }) {
  const { target } = useTargetContainer();

  switch (type) {
    case "inspect":
      if (target) {
        return <InspectorBody />;
      } else {
        return <EmptyState />;
      }
    case "comment":
      return <ConversationsBody />;
  }
}

function ConversationsBody() {
  return <Conversations />;
}

function InspectorBody() {
  return (
    <>
      <InfoSection />
      <LayoutSection />
      <ColorsSection />
      <AssetsSection />
      <TypographySection />
      <ContentSection />
      <CodeSection />
    </>
  );
}

function EmptyState() {
  return (
    <EmptyStateContainer>
      <EmptyStateText>Nothing selected</EmptyStateText>
    </EmptyStateContainer>
  );
}

const EmptyStateContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
`;

const EmptyStateText = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.5);
`;

function Tabs({
  onTabChange,
  selectedTab,
}: {
  selectedTab: Tab;
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
        selected={selectedTab === "comment"}
        onClick={() => {
          onTabChange("comment");
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
