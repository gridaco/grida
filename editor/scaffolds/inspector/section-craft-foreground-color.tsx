import { ColorPicker } from "@editor-ui/color-picker";
import * as Popover from "@radix-ui/react-popover";
import type { RGBA, RGBAF } from "@reflect-ui/core";
import { ColorChip, GradientChip } from "@code-editor/property";
import { useDispatch } from "core/dispatch";
import { useCallback, useState } from "react";

export function CraftForegroundColorSection() {
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
        type: "(draft)/(craft)/node/foreground-color",
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
