import React from "react";
import styled from "@emotion/styled";
import { PageContentLayout } from "../layouts";
import { CanvasModeSelectItem } from "../components";

export function EditorPreferencePage() {
  return (
    <PageContentLayout>
      <h1>Editor</h1>

      <section>
        <h2>Canvas</h2>
        <CanvasModeSelection />
      </section>
    </PageContentLayout>
  );
}

const renderer_engines = [
  "bitmap-renderer",
  "figma-renderer",
  // "vanilla-renderer",
] as const;

function CanvasModeSelection() {
  const [selection, setSelection] = React.useState<string>(
    canvas_mode_card_meta.default
  );

  return (
    <SelectionLayout>
      {renderer_engines.map((item) => {
        const { name } = canvas_mode_card_meta[item];
        return (
          <CanvasModeSelectItem
            key={item}
            mode={item}
            label={name}
            onClick={() => setSelection(item)}
            selected={selection === item}
            preview={<div />}
          />
        );
      })}
    </SelectionLayout>
  );
}

const SelectionLayout = styled.div`
  display: flex;
  flex-direction: row;
  gap: 16px;
`;

const canvas_mode_card_meta = {
  default: "bitmap-renderer",
  "bitmap-renderer": {
    name: "Bitmap Renderer",
  },
  "figma-renderer": {
    name: "Figma Renderer",
  },
  "vanilla-renderer": {
    name: "Vanilla Renderer",
  },
} as const;
