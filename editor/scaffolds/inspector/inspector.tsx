import React, { useCallback, useState } from "react";
import styled from "@emotion/styled";
import { EditorState, useEditorState, useWorkspaceState } from "core/states";
import { colors } from "theme";
import { useTargetContainer } from "hooks/use-target-node";
import { EditorPropertyThemeProvider, one } from "@editor-ui/property";
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
import { EffectsSection } from "./section-effects";
import { MixIcon, Cross1Icon } from "@radix-ui/react-icons";
import { DebugInspector } from "./inspector-debug";
import { IconToggleButton } from "@code-editor/ui";

type Tab = "inspect" | "comment";

export function Inspector() {
  const { debugMode } = useWorkspaceState();
  const [debugView, setDebugView] = useState(false);
  const [state] = useEditorState();
  const dispatch = useDispatch();

  const tab = __mode(state.designerMode);

  const switchMode = useCallback(
    (mode: Tab) => {
      dispatch({
        type: "designer-mode",
        mode: mode,
      });
    },
    [dispatch]
  );

  return (
    <InspectorContainer>
      <EditorAppbarFragments.RightSidebar flex={0} />
      <div className="header">
        <Tabs selectedTab={tab} onTabChange={switchMode} />
        {debugMode && (
          <IconToggleButton
            on={<Cross1Icon color="white" />}
            off={<MixIcon color="white" />}
            onChange={(value) => {
              setDebugView(value);
            }}
          />
        )}
      </div>
      {/* <div style={{ height: 16, flexShrink: 0 }} /> */}
      <Body type={tab} debug={debugView} />
    </InspectorContainer>
  );
}

export function CraftInspector() {
  const { debugMode } = useWorkspaceState();
  const [debugView, setDebugView] = useState(false);
  const [state] = useEditorState();
  const dispatch = useDispatch();

  return (
    <InspectorContainer>
      <EditorAppbarFragments.RightSidebar flex={0} />
      <div className="header">
        {debugMode && (
          <IconToggleButton
            on={<Cross1Icon color="white" />}
            off={<MixIcon color="white" />}
            onChange={(value) => {
              setDebugView(value);
            }}
          />
        )}
      </div>
      {/* <div style={{ height: 16, flexShrink: 0 }} /> */}
      <CraftBody type={"inspect"} />
    </InspectorContainer>
  );
}

const __mode = (mode: EditorState["designerMode"]): Tab => {
  switch (mode) {
    case "comment":
      return "comment";
    case "inspect":
    default:
      return "inspect";
  }
};

function Body({ type, debug }: { type: Tab; debug?: boolean }) {
  const { target } = useTargetContainer();

  switch (type) {
    case "inspect":
      if (target) {
        return <InspectorBody debug={debug} />;
      } else {
        return <EmptyState />;
      }
    case "comment":
      return <ConversationsBody />;
  }
}

function CraftBody({ type, debug }: { type: Tab; debug?: boolean }) {
  const [state] = useEditorState();

  const target = state.craft.children.find(
    (c) => c.id === state.selectedNodes[0]
  );

  if (target) {
    return <InspectorBody debug={debug} />;
  } else {
    return <EmptyState />;
  }
}

function ConversationsBody() {
  return <Conversations />;
}

function InspectorBody({ debug }: { debug?: boolean }) {
  if (debug) {
    return <DebugInspector />;
  }

  return (
    <EditorPropertyThemeProvider theme={one.dark}>
      <InfoSection />
      <LayoutSection />
      <AssetsSection />
      <TypographySection />
      <ColorsSection />
      <EffectsSection />
      <ContentSection />
      <CodeSection />
    </EditorPropertyThemeProvider>
  );
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center h-full">
      <span className="text-sm font-medium text-white opacity-50">
        No selection
      </span>
    </div>
  );
}

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
  gap: 4px;
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
  padding: 6px;
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
  &[data-selected="true"] {
    color: white !important;
    font-weight: 500;
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

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 0;
    padding-right: 16px;
  }
`;
/* background-color: ${(props) => props.theme.colors.background}; */
