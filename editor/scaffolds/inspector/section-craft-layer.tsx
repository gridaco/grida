import {
  PropertyCheckboxInput,
  PropertyGroup,
  PropertyGroupHeader,
  PropertyInput,
  PropertyLine,
  PropertyLines,
  PropertyNumericInput,
  PropertySliderInput,
} from "@editor-ui/property";
import {
  CornerBottomLeftIcon,
  CornerBottomRightIcon,
  CornerTopLeftIcon,
  CornerTopRightIcon,
  CornersIcon,
} from "@radix-ui/react-icons";
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
        width: w,
        height: h,
      });
    },
    [dispatch]
  );

  const onOpacityChange = useCallback(
    (value100: number) => {
      dispatch({
        type: "(craft)/node/opacity",
        opacity: value100 === 0 ? 0 : value100 / 100,
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
        <PropertyCornerRadiusLine />
        <PropertyLine label="Opacity">
          <PropertySliderInput
            stopPropagation
            value={[opacity100]}
            min={0}
            max={100}
            step={1}
            onValueChange={(value) => {
              onOpacityChange(value[0]);
            }}
          />
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

function PropertyCornerRadiusLine() {
  const dispatch = useDispatch();
  const element = useInspectorElement();

  const cornerRadius: number = (element?.style?.borderRadius || 0) as number;
  // element?.style?.;
  const {
    borderRadius: _radius,
    borderTopLeftRadius: _tl,
    borderTopRightRadius: _tr,
    borderBottomLeftRadius: _bl,
    borderBottomRightRadius: _br,
  } = element?.style || {};

  const tr = numeric(_tr);
  const tl = numeric(_tl);
  const br = numeric(_br);
  const bl = numeric(_bl);

  const hasradius = tr || tl || br || bl;
  const radiusone = tr === tl && tl === br && br === bl;

  const onCornerRadiusChange = useCallback(
    (value: number) => {
      dispatch({
        type: "(craft)/node/corner-radius/all",
        radius: value,
      });
    },
    [dispatch]
  );

  const onCornerRadiusEachChange = useCallback(
    (corners: { tl?: number; tr?: number; br?: number; bl?: number }) => {
      dispatch({
        type: "(craft)/node/corner-radius/each",
        radius: corners,
      });
    },
    [dispatch]
  );

  return (
    <>
      <PropertyLine label="Corner">
        <PropertyNumericInput
          value={cornerRadius}
          stopPropagation
          min={0}
          suffix={<CornersIcon />}
          onChange={onCornerRadiusChange}
        />
      </PropertyLine>
      <PropertyLine label="Corners" gap={4}>
        <PropertyNumericInput
          stopPropagation
          min={0}
          suffix={<CornerTopLeftIcon />}
          value={tl}
          onChange={(v) => onCornerRadiusEachChange({ tl: v })}
        />
        <PropertyNumericInput
          stopPropagation
          min={0}
          suffix={<CornerTopRightIcon />}
          value={tr}
          onChange={(v) => onCornerRadiusEachChange({ tr: v })}
        />
        <PropertyNumericInput
          stopPropagation
          min={0}
          suffix={<CornerBottomRightIcon />}
          value={br}
          onChange={(v) => onCornerRadiusEachChange({ br: v })}
        />
        <PropertyNumericInput
          stopPropagation
          min={0}
          suffix={<CornerBottomLeftIcon />}
          value={bl}
          onChange={(v) => onCornerRadiusEachChange({ bl: v })}
        />
      </PropertyLine>
    </>
  );

  // return (
  //   <>
  //     {radiusone ? (
  //       <PropertyLine label="Corner">
  //         <PropertyNumericInput
  //           value={cornerRadius}
  //           stopPropagation
  //           min={0}
  //           suffix={<CornersIcon />}
  //           onChange={onCornerRadiusChange}
  //         />
  //       </PropertyLine>
  //     ) : (
  //       <PropertyLine label="Corners">
  //         <PropertyNumericInput suffix={"tr"} value={tr} />
  //         <PropertyNumericInput suffix={"tl"} value={tl} />
  //         <PropertyNumericInput suffix={"br"} value={br} />
  //         <PropertyNumericInput suffix={"bl"} value={bl} />
  //       </PropertyLine>
  //     )}
  //   </>
  // );
}

const numeric = (v: number | string | undefined) =>
  typeof v === "number" ? rd(v) : undefined;
const rd = (v: number) => Math.round(v * 100) / 100;
