import React, { useState, useCallback } from "react";
import {
  PropertyLine,
  PropertyLines,
  PropertyGroup,
  PropertyGroupHeader,
  PropertyInput,
} from "@editor-ui/property";
import type { RGBA } from "@reflect-ui/core";
import * as Popover from "@radix-ui/react-popover";
import { MinusIcon, PlusIcon } from "@radix-ui/react-icons";
import { ColorPicker } from "@editor-ui/color-picker";
import { useDispatch } from "core/dispatch";
import { useInspectorElement } from "hooks/use-inspector-element";
import { ColorChip } from "@code-editor/property";

export function CraftBorderSection() {
  const dispatch = useDispatch();
  const element = useInspectorElement();

  const [color, setColor] = useState<RGBA>({
    r: 255,
    g: 255,
    b: 255,
    a: 1,
  });

  const onAddBorder = useCallback(() => {
    dispatch({
      type: "(craft)/node/border/add",
    });
  }, [dispatch]);

  const onRemoveBorder = useCallback(() => {
    dispatch({
      type: "(craft)/node/border/remove",
    });
  }, [dispatch]);

  const onBorderWidthChange = useCallback(
    (value: number) => {
      dispatch({
        type: "(craft)/node/border/width",
        width: value,
      });
    },
    [dispatch]
  );

  const draftBorderColor = useCallback(
    (color: RGBA) => {
      dispatch({
        type: "(draft)/(craft)/node/border/color",
        color: color,
      });
    },
    [dispatch]
  );

  if (!element) {
    return <></>;
  }

  if (!element.style || !element.style.borderWidth) {
    return (
      <PropertyGroup>
        <PropertyGroupHeader onClick={onAddBorder} dividers asButton>
          <h6>Border</h6>
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
        <button onClick={onRemoveBorder}>
          <MinusIcon />
        </button>
      </PropertyGroupHeader>
      <PropertyLines>
        <PropertyLine label="Width">
          <PropertyInput
            value={element.style.borderWidth}
            min={0}
            stopPropagation
            type="number"
            suffix={"px"}
            onChange={(text) => {
              const val = Number(text);

              if (isNaN(val)) {
                return;
              }

              onBorderWidthChange(val);
            }}
          />
        </PropertyLine>
        <PropertyLine label="Color">
          <Popover.Root>
            <Popover.Trigger>
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
            </Popover.Content>
          </Popover.Root>
        </PropertyLine>
      </PropertyLines>
    </PropertyGroup>
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
