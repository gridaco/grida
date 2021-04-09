import React from "react";
import { useMemo } from "react";
import { SKRect, Stage, useCanvaskit } from "@nothing.app/react-core/lib";

export default function App() {
  return (
    <Stage
      canvasSize={{
        width: 1000,
        height: 500,
      }}
      canvasInsets={{
        left: 0,
        right: 0,
      }}
    >
      <CGRect
        x={10}
        y={10}
        width={100}
        height={100}
        background={{}}
        strokeWidth={5}
      />
    </Stage>
  );
}

import { Rect as TRect } from "@reflect-ui/uiutils/lib/types";

import { Paint } from "canvaskit-wasm";
import makePaint, {
  PaintParameters,
} from "@nothing.app/react-core/lib/sk-utils/make-paint";
import { Primitives } from "@nothing.app/react-compact/lib";

interface SolidFill {
  // color: string;
}

/**
 * easier rect usage props
 */
interface CGRectProps {
  x: number;
  y: number;
  width: number;
  background: SolidFill;
  strokeWidth?: number;
  height: number;
  paint?: Paint | PaintParameters;
}

function CGRect(props: CGRectProps) {
  const { CanvasKit } = useCanvaskit();

  const rect: TRect = {
    x: props.x,
    y: props.y,
    width: props.width,
    height: props.height,
  };

  // Primitives.color()

  const paint = makePaint({
    style: CanvasKit.PaintStyle.Stroke,
    color: CanvasKit.Color(0, 0, 0, 1),
    strokeWidth: props.strokeWidth,
  });

  return <SKRect rect={Primitives.rect(CanvasKit, rect)} paint={paint} />;
}
