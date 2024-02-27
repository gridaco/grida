import React, { useCallback, useState } from "react";
import styled from "@emotion/styled";
import { EditorState, useEditorState, useWorkspaceState } from "core/states";
import { colors } from "theme";
import { useTargetContainer } from "hooks/use-target-node";
import { EditorPropertyThemeProvider, one } from "@editor-ui/property";
import { CrafInfoSection, InfoSection } from "./section-info";
import { CraftLayoutSection, LayoutSection } from "./section-layout";
import { ColorsSection } from "./section-colors";
import { ContentSection, CrafContentSection } from "./section-content";
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
import { EmptyState, InspectorContainer } from "./inspector-readonly";

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
      <CraftBackgroundColorSection />
      {/* <AssetsSection /> */}
      {/* <TypographySection /> */}
      {/* <ColorsSection /> */}
      {/* <EffectsSection /> */}
      <CrafContentSection />
      {/* <CodeSection /> */}
    </EditorPropertyThemeProvider>
  );
}

import { ColorPicker } from "@editor-ui/color-picker";
import * as Popover from "@radix-ui/react-popover";
import type { RGBA, RGBAF } from "@reflect-ui/core";
import { ColorChip, GradientChip } from "@code-editor/property";

function CraftBackgroundColorSection() {
  const dispatch = useDispatch();
  const [color, setColor] = useState<RGBA>({
    r: 255,
    g: 255,
    b: 255,
    a: 1,
  });

  const draftColor = useCallback(
    (color: RGBA) => {
      dispatch({
        type: "(draft)/(craft)/node/background-color",
        color: color,
      });
    },
    [dispatch]
  );

  return (
    <section className="flex flex-col p-3">
      {/* popover */}
      <Popover.Root>
        <Popover.Trigger>
          <ColorChip outline color={color ? rgba2rgbo(color) : undefined} />
        </Popover.Trigger>
        <Popover.Content>
          <ColorPicker
            color={color}
            onChange={(color) => {
              setColor(color);
              draftColor(color);
            }}
          />
        </Popover.Content>
      </Popover.Root>
    </section>
  );
}

/**
 * 255 rgba to 1 rgbo
 * @param rgba
 */
const rgba2rgbo = (rgba: RGBA) => {
  return {
    r: rgba.r / 255,
    g: rgba.g / 255,
    b: rgba.b / 255,
    o: 1 - rgba.a,
  };
};
