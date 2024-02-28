import {
  PropertyGroup,
  PropertyGroupHeader,
  PropertyInput,
  PropertyLine,
  PropertyLines,
} from "@editor-ui/property";
import { CornersIcon } from "@radix-ui/react-icons";
import type { IRadius } from "@reflect-ui/core";
import { useDispatch } from "core/dispatch";
import { useInspectorElement } from "hooks/use-inspector-element";
import { useCallback } from "react";

export function CraftLayoutSection() {
  const dispatch = useDispatch();
  const element = useInspectorElement();

  const onPositionChange = useCallback(
    (w?: number, h?: number) => {
      //
    },
    [dispatch]
  );

  const onSizeChange = useCallback(
    (w?: number, h?: number) => {
      //
    },
    [dispatch]
  );

  const onCornerRadiusChange = useCallback(
    (value: number) => {
      dispatch({
        type: "(craft)/node/corners",
        radius: value,
      });
    },
    [dispatch]
  );

  const onOpacityChange = useCallback(
    (value100: number) => {
      dispatch({
        type: "(craft)/node/opacity",
        opacity: value100 / 100,
      });
    },
    [dispatch]
  );

  if (!element) {
    return <></>;
  }

  const { x, y, id, width, height, type } = element;

  // round to 2 decimal places
  const dx = rd(x);
  const dy = rd(y);
  const dw = rd(width);
  const dh = rd(height);

  const opacity100 = ((element?.style?.opacity as number) || 1) * 100;

  // let tr, tl, br, bl;
  // if ("cornerRadius" in element) {
  //   const { bl: _bl, br: _br, tl: _tl, tr: _tr } = element.cornerRadius;
  //   tr = numeric(_tr);
  //   tl = numeric(_tl);
  //   br = numeric(_br);
  //   bl = numeric(_bl);
  // }

  // const hasradius = tr || tl || br || bl;
  // const radiusone = tr === tl && tl === br && br === bl;

  return (
    <PropertyGroup>
      <PropertyGroupHeader>
        <h6>Layout</h6>
      </PropertyGroupHeader>
      <PropertyLines key={id}>
        <PropertyLine label="Position">
          <PropertyInput stopPropagation suffix={"X"} value={dx} />
          <PropertyInput stopPropagation suffix={"Y"} value={dy} />
        </PropertyLine>
        <PropertyLine label="Size">
          <PropertyInput stopPropagation suffix={"W"} value={dw} />
          <PropertyInput stopPropagation suffix={"H"} value={dh} />
        </PropertyLine>
        <PropertyLine label="Corner">
          <PropertyInput
            value={element.style.borderRadius || 0}
            stopPropagation
            min={0}
            type="number"
            suffix={<CornersIcon />}
            onChange={(txt) => {
              const val = Number(txt);
              if (isNaN(val)) {
                return;
              }
              onCornerRadiusChange(val);
            }}
          />
        </PropertyLine>
        {/* {!!hasradius && (
          <PropertyLine label="Radius">
            {radiusone ? (
              <>
                <ReadonlyProperty value={tr} />
              </>
            ) : (
              <>
                <ReadonlyProperty suffix={"tr"} value={tr} />
                <ReadonlyProperty suffix={"tl"} value={tl} />
                <ReadonlyProperty suffix={"br"} value={br} />
                <ReadonlyProperty suffix={"bl"} value={bl} />
              </>
            )}
          </PropertyLine>
        )} */}
        <PropertyLine label="Opacity">
          {/* <PropertySliderInput
            value={[100]}
            min={0}
            max={100}
            step={1}
            onValueChange={(value) => {}}
          /> */}
          <PropertyInput
            min={0}
            max={100}
            stopPropagation
            type="number"
            suffix={"%"}
            onChange={(text) => {
              const val = Number(text);

              if (isNaN(val)) {
                return;
              }

              onOpacityChange(val);
            }}
            value={opacity100}
          />
        </PropertyLine>
      </PropertyLines>
    </PropertyGroup>
  );
}

const numeric = (v: IRadius) => (typeof v === "number" ? rd(v) : null);
const rd = (v: number) => Math.round(v * 100) / 100;
