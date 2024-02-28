import React, { useState, useCallback } from "react";
import {
  PropertyLine,
  PropertyLines,
  PropertyGroup,
  PropertyGroupHeader,
  PropertyInput,
} from "@editor-ui/property";
import { PlusIcon } from "@radix-ui/react-icons";
import type { RGBA } from "@reflect-ui/core";
import * as Popover from "@radix-ui/react-popover";
import { ColorPicker } from "@editor-ui/color-picker";
import { useDispatch } from "core/dispatch";
import { useInspectorElement } from "hooks/use-inspector-element";
import { ColorChip } from "@code-editor/property";

export function CraftBoxShadowSection() {
  const element = useInspectorElement();
  const dispatch = useDispatch();

  const onBoxShadowAdd = useCallback(() => {}, [dispatch]);

  const onBoxShadowColorChange = useCallback(() => {}, [dispatch]);

  const onBoxShadowOffsetChange = useCallback(() => {}, [dispatch]);

  const onBoxShadowBlurChange = useCallback(
    (blur: number) => {
      blur;
    },
    [dispatch]
  );

  const onBoxShadowSpreadChange = useCallback(() => {}, [dispatch]);

  if (!element) {
    return <></>;
  }

  const hasBoxShadow = element.style.boxShadow;

  const boxShadowBlur = 0;

  if (!hasBoxShadow) {
    return (
      <PropertyGroup>
        <PropertyGroupHeader onClick={onBoxShadowAdd} dividers asButton>
          <h6>Box Shadow</h6>
          <button>
            <PlusIcon />
          </button>
        </PropertyGroupHeader>
      </PropertyGroup>
    );
  }

  return (
    <PropertyGroup>
      <PropertyGroupHeader>
        <h6>Border</h6>
      </PropertyGroupHeader>
      <PropertyLines>
        <PropertyLine label="Width">
          <PropertyInput
            value={boxShadowBlur}
            min={0}
            stopPropagation
            type="number"
            suffix={"px"}
            onChange={(text) => {
              const val = Number(text);

              if (isNaN(val)) {
                return;
              }

              onBoxShadowBlurChange(val);
            }}
          />
        </PropertyLine>
        <PropertyLine label="Color">
          <Popover.Root>
            {/* <Popover.Trigger>
              <ColorChip outline color={color ? rgba2rgbo(color) : undefined} />
            </Popover.Trigger>
            <Popover.Content>
              <ColorPicker
                color={color}
                onChange={(color) => {
                  setColor(color);
                  draftBorderColor(color);
                }}
              />
            </Popover.Content> */}
          </Popover.Root>
        </PropertyLine>
      </PropertyLines>
    </PropertyGroup>
  );
}
