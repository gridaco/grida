import {
  PropertyCheckboxInput,
  PropertyGroup,
  PropertyGroupHeader,
  PropertyInput,
  PropertyLine,
  PropertyLines,
  PropertyNumericInput,
} from "@editor-ui/property";
import { CornersIcon } from "@radix-ui/react-icons";
import type { IRadius } from "@reflect-ui/core";
import { useDispatch } from "core/dispatch";
import { useInspectorElement } from "hooks/use-inspector-element";
import { useCallback } from "react";

export function CraftLayerSection() {
  const dispatch = useDispatch();
  const element = useInspectorElement();

  const onPositionChange = useCallback(
    (x?: number, y?: number) => {
      dispatch({
        type: "node-transform-position",
        x,
        y,
      });
    },
    [dispatch]
  );

  const onSizeChange = useCallback(
    (w?: number, h?: number) => {
      dispatch({
        type: "node-resize",
        origin: "nw",
        width: w,
        height: h,
      });
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

  const onClipChange = useCallback(
    (clip: boolean) => {
      dispatch({
        type: "(craft)/node/overflow",
        value: clip ? "hidden" : "visible",
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

  const clipsContent = element?.style?.overflow === "hidden";
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
      <PropertyLines key={id}>
        <PropertyLine label="Position">
          <PropertyNumericInput
            stopPropagation
            suffix={"X"}
            value={dx}
            onChange={(x) => {
              onPositionChange(x, undefined);
            }}
          />
          <PropertyNumericInput
            stopPropagation
            suffix={"Y"}
            value={dy}
            onChange={(y) => {
              onPositionChange(undefined, y);
            }}
          />
        </PropertyLine>
        <PropertyLine label="Size">
          <PropertyNumericInput
            stopPropagation
            suffix={"W"}
            value={dw}
            onChange={(w) => {
              onSizeChange(w);
            }}
          />
          <PropertyNumericInput
            stopPropagation
            suffix={"H"}
            value={dh}
            onChange={(h) => {
              onSizeChange(undefined, h);
            }}
          />
        </PropertyLine>
        <PropertyLine label="Corner">
          <PropertyNumericInput
            value={element.style?.borderRadius || 0}
            stopPropagation
            min={0}
            suffix={<CornersIcon />}
            onChange={onCornerRadiusChange}
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
          <PropertyNumericInput
            min={0}
            max={100}
            stopPropagation
            suffix={"%"}
            onChange={onOpacityChange}
            value={opacity100}
          />
        </PropertyLine>
        <PropertyLine label="Clip">
          <PropertyCheckboxInput onChange={onClipChange} value={clipsContent} />
        </PropertyLine>
      </PropertyLines>
    </PropertyGroup>
  );
}

const numeric = (v: IRadius) => (typeof v === "number" ? rd(v) : null);
const rd = (v: number) => Math.round(v * 100) / 100;
