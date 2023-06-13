import React, { useCallback, useState } from "react";
import styled from "@emotion/styled";
import { EditorPropertyThemeProvider, one } from "@editor-ui/property";
import { InfoSection } from "./section-info";
import { LayoutSection } from "./section-layout";
import { ColorsSection } from "./section-colors";
import { TypographySection } from "./section-typography";
import { useTargetContainer } from "hooks/use-target-node";
import { NodeGraph, JsonTree } from "@code-editor/devtools";
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
        <LayoutSection />
        <GraphInspectionSection>
          <h5>graph</h5>
          {target && (
            <div data-no-padding style={{ marginTop: 16 }}>
              <NodeGraph
                key={target.id}
                width={width}
                height={800}
                data={target}
              />
            </div>
          )}
        </GraphInspectionSection>
        <TypographySection />
        <ColorsSection />
        <GraphInspectionSection>
          <h5>document - api-response</h5>
          <div>
            <JsonTree
              sortkeys={figma_json_sortkeys}
              backgroundColor="transparent"
              data={{}}
            />
          </div>
        </GraphInspectionSection>
        <GraphInspectionSection>
          <h5>document - mapped</h5>
          <div>
            <JsonTree
              sortkeys={figma_json_sortkeys}
              backgroundColor="transparent"
              data={{}}
            />
          </div>
        </GraphInspectionSection>
        <GraphInspectionSection>
          <h5>token - figma-to-reflect</h5>
          <div>
            <JsonTree
              sortkeys={figma_json_sortkeys}
              backgroundColor="transparent"
              data={target}
            />
          </div>
        </GraphInspectionSection>
        <GraphInspectionSection>
          <h5>widget - widget-tree</h5>
          <div>
            <JsonTree
              sortkeys={figma_json_sortkeys}
              backgroundColor="transparent"
              data={{}}
            />
          </div>
        </GraphInspectionSection>
        <GraphInspectionSection>
          <h5>widget - framework-dedicated</h5>
          <div>
            <JsonTree
              sortkeys={figma_json_sortkeys}
              backgroundColor="transparent"
              data={{}}
            />
          </div>
        </GraphInspectionSection>
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

  padding: 14px 0;
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
    font-family: "Monaco", "Menlo", "Ubuntu Mono", "Consolas", "source-code-pro",
      monospace;
  }

  /* apply padding to top level elements */
  > * {
    padding: 0 14px;
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
