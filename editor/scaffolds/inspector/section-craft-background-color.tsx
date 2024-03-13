import { ColorPicker } from "@editor-ui/color-picker";
import * as Popover from "@radix-ui/react-popover";
import type { RGBA, RGBAF } from "@reflect-ui/core";
import { ColorChip, GradientChip } from "@code-editor/property";
import { useDispatch } from "core/dispatch";
import { useCallback, useState } from "react";
import {
  PropertyGroup,
  PropertyGroupHeader,
  PropertyLine,
  PropertyLines,
} from "@editor-ui/property";
import { useInspectorElement } from "hooks/use-inspector-element";

export function CraftBackgroundColorSection() {
  const dispatch = useDispatch();
  const element = useInspectorElement();

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

  if (!element) {
    return <></>;
  }

  return (
    <PropertyGroup>
      <PropertyGroupHeader>
        <h6>Background</h6>
      </PropertyGroupHeader>
      <PropertyLines>
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
                  draftColor(color);
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
