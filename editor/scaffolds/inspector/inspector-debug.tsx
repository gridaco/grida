import React, { useCallback, useState } from "react";
import styled from "@emotion/styled";
import { EditorPropertyThemeProvider, one } from "@editor-ui/property";
import { InfoSection } from "./section-info";
import { LayoutSection } from "./section-layout";
import { ColorsSection } from "./section-colors";
import { TypographySection } from "./section-typography";
import { useTargetContainer } from "hooks/use-target-node";
import {
  HorizontalHierarchyTreeVisualization,
  JsonTree,
} from "@code-editor/devtools";
import useMeasure from "react-use-measure";

const figma_json_sortkeys = [
  // essential
  "id",
  "name",
  "type",
  // geometry
  "x",
  "y",
  "width",
  "height",
  // hierarchical
  "parent",
  "children",
  // appearance
  "visible",
  "opacity",
  "blendMode",
  "isMask",
  // fills, strokes, effects
  "fills",
  "strokes",
  "strokeStyleId",
  "strokeWeight",
  "strokeMiterLimit",
  "strokeAlign",
  "strokeCap",
  "strokeJoin",
  "dashPattern",
  "effects",
  "effectStyleId",
];

export function DebugInspector() {
  const [ref, { width }] = useMeasure();
  const { target } = useTargetContainer();
  // target

  return (
    <div ref={ref}>
      <EditorPropertyThemeProvider theme={one.dark}>
        <InfoSection />
        <GraphInspectionSection>
          <h5>document - api-response</h5>
          <JsonTree
            sortkeys={figma_json_sortkeys}
            backgroundColor="transparent"
            data={{}}
          />
        </GraphInspectionSection>
        <GraphInspectionSection>
          <h5>document - mapped</h5>
          <JsonTree
            sortkeys={figma_json_sortkeys}
            backgroundColor="transparent"
            data={{}}
          />
        </GraphInspectionSection>
        <GraphInspectionSection>
          <h5>token - figma-to-reflect</h5>
          <JsonTree
            sortkeys={figma_json_sortkeys}
            backgroundColor="transparent"
            data={target}
          />
        </GraphInspectionSection>
        <GraphInspectionSection>
          <h5>widget - widget-tree</h5>
          <JsonTree
            sortkeys={figma_json_sortkeys}
            backgroundColor="transparent"
            data={{}}
          />
        </GraphInspectionSection>
        <GraphInspectionSection>
          <h5>widget - framework-dedicated</h5>
          <JsonTree
            sortkeys={figma_json_sortkeys}
            backgroundColor="transparent"
            data={{}}
          />
        </GraphInspectionSection>
        <GraphInspectionSection>
          <h5>graph</h5>
          {target && (
            <div data-no-padding>
              <HorizontalHierarchyTreeVisualization
                width={width}
                height={400}
                tree={target}
              />
            </div>
          )}
        </GraphInspectionSection>
        <LayoutSection />
        <TypographySection />
        <ColorsSection />
      </EditorPropertyThemeProvider>
    </div>
  );
}

function GraphInspectionSection({ children }: React.PropsWithChildren<{}>) {
  return <Section>{children}</Section>;
}

const Section = styled.section`
  display: flex;
  flex-direction: column;

  margin: 16px 0;

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    cursor: default;
    color: white;
    margin: 0;
    padding: 0;
    font-family: "Monaco", "Menlo", "Ubuntu Mono", "Consolas", "source-code-pro",
      monospace;
  }

  /* apply padding to top level elements */
  > * {
    padding: 14px;
  }

  * {
    &[data-no-padding="true"] {
      padding: 0;
    }
  }

  &:hover {
    background-color: rgba(255, 255, 255, 0.05);
  }

  transition: background-color 0.2s ease-in-out;
`;
