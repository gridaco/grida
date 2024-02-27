import React, { useCallback, useState } from "react";
import styled from "@emotion/styled";
import { EditorState, useEditorState, useWorkspaceState } from "core/states";
import { colors } from "theme";
import { EditorPropertyThemeProvider, one } from "@editor-ui/property";
import { CrafInfoSection, InfoSection } from "./section-info";
import { CraftLayoutSection, LayoutSection } from "./section-layout";
import { EditorAppbarFragments } from "components/editor";
import { useDispatch } from "core/dispatch";
import { MixIcon, Cross1Icon } from "@radix-ui/react-icons";
import { DebugInspector } from "./inspector-debug";
import { IconToggleButton } from "@code-editor/ui";
import { EmptyState, InspectorContainer } from "./inspector-readonly";
import { CraftBackgroundColorSection } from "./section-craft-background-color";
import { CrafContentSection } from "./section-craft-text";
import { CraftForegroundColorSection } from "./section-craft-foreground-color";
import { CraftIconSection } from "./section-craft-icon";
import { CraftOpacitySection } from "./section-craft-opacity";

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
      <CraftBody />
    </InspectorContainer>
  );
}

function CraftBody({ debug }: { debug?: boolean }) {
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

function InspectorBody({ debug }: { debug?: boolean }) {
  if (debug) {
    return <DebugInspector />;
  }

  return (
    <EditorPropertyThemeProvider theme={one.dark}>
      <CrafInfoSection />
      <CraftLayoutSection />
      <CraftOpacitySection />
      <CraftBackgroundColorSection />
      <CraftForegroundColorSection />
      <CraftIconSection />
      {/* <AssetsSection /> */}
      {/* <TypographySection /> */}
      {/* <ColorsSection /> */}
      {/* <EffectsSection /> */}
      <CrafContentSection />
      {/* <CodeSection /> */}
    </EditorPropertyThemeProvider>
  );
}
