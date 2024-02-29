import React from "react";
import { useEditorState } from "core/states";
import { EditorPropertyThemeProvider, one } from "@editor-ui/property";
import { CrafInfoSection } from "./section-info";
import { EditorAppbarFragments } from "components/editor";
import { DebugInspector } from "./inspector-debug";
import { EmptyState, InspectorContainer } from "./inspector-readonly";
import { CraftBackgroundColorSection } from "./section-craft-background-color";
import { CrafTextSection } from "./section-craft-text";
import { CraftForegroundColorSection } from "./section-craft-foreground-color";
import { CraftIconSection } from "./section-craft-icon";
import { CraftBorderSection } from "./section-craft-border";
import { CraftBoxShadowSection } from "./section-craft-box-shadow";
import { CraftLayerSection } from "./section-craft-layer";
import { CraftBoxLayoutSection } from "./section-craft-box";
import { CraftSrcSection } from "./section-craft-src";

export function CraftInspector() {
  return (
    <InspectorContainer>
      <EditorAppbarFragments.RightSidebar flex={0} />
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
      <CraftLayerSection />
      <CrafTextSection />
      <CraftBoxLayoutSection />
      <CraftBackgroundColorSection />
      <CraftForegroundColorSection />
      <CraftSrcSection />
      <CraftIconSection />
      <CraftBorderSection />
      <CraftBoxShadowSection />
      {/* <CodeSection /> */}
    </EditorPropertyThemeProvider>
  );
}
