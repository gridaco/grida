"use client";

import * as React from "react";
import type cmath from "@grida/cmath";
import { guide, type SnapResult } from "@grida/cmath/_snap";
import type { Measurement } from "@grida/cmath/_measurement";
import {
  HUDCanvas,
  type HUDDraw,
  snapGuideToHUDDraw,
  measurementToHUDDraw,
  marqueeToHUDDraw,
  lassoToHUDDraw,
} from "./primitives";
import { Surface, type SurfaceOptions } from "./surface";

// ---------------------------------------------------------------------------
// useHUDSurface — imperative Surface bound to a canvas ref
// ---------------------------------------------------------------------------

/**
 * Instantiate a `Surface` against the given canvas element and return the
 * imperative instance. The surface is created once and reused across renders;
 * its providers are kept up to date via refs so the host can pass new
 * closures freely.
 *
 * The hook does **not** wire pointer events — the host attaches listeners
 * to whatever element it wants (usually the canvas's container) and calls
 * `surface.dispatch(event)` directly. This keeps the hook framework-agnostic
 * past React's lifecycle.
 */
export function useHUDSurface(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  options: SurfaceOptions
): Surface | null {
  const [surface, setSurface] = React.useState<Surface | null>(null);

  // Keep latest provider closures in refs.
  const pickRef = React.useRef(options.pick);
  const shapeOfRef = React.useRef(options.shapeOf);
  const onIntentRef = React.useRef(options.onIntent);
  pickRef.current = options.pick;
  shapeOfRef.current = options.shapeOf;
  onIntentRef.current = options.onIntent;

  React.useLayoutEffect(() => {
    if (!canvasRef.current) return;
    const s = new Surface(canvasRef.current, {
      pick: (p) => pickRef.current(p),
      shapeOf: (id) => shapeOfRef.current(id),
      onIntent: (i) => onIntentRef.current(i),
      style: options.style,
      readonly: options.readonly,
      color: options.color,
    });
    setSurface(s);
    return () => {
      s.dispose();
      setSurface(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasRef]);

  // Sync style/readonly on every render (cheap).
  React.useEffect(() => {
    if (!surface) return;
    if (options.style) surface.setStyle(options.style);
    if (options.readonly !== undefined) surface.setReadonly(options.readonly);
  }, [surface, options.style, options.readonly]);

  return surface;
}

// ---------------------------------------------------------------------------
// Generic HUD overlay — thin React bridge around HUDCanvas
// ---------------------------------------------------------------------------

export interface HUDOverlayProps {
  width: number;
  height: number;
  transform: cmath.Transform;
  draw: HUDDraw | undefined;
  color?: string;
  className?: string;
}

/**
 * Generic HUD overlay component.
 *
 * Renders a `<canvas>` element driven by {@link HUDCanvas}. Pass a
 * pre-built {@link HUDDraw} command list to control what is drawn.
 */
export const HUDOverlay: React.FC<HUDOverlayProps> = (props) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const rendererRef = React.useRef<HUDCanvas | null>(null);

  React.useLayoutEffect(() => {
    if (!canvasRef.current) return;
    if (!rendererRef.current) {
      rendererRef.current = new HUDCanvas(canvasRef.current, {
        color: props.color,
      });
    }

    rendererRef.current.setColor(props.color);
    rendererRef.current.setSize(props.width, props.height);
    rendererRef.current.setTransform(props.transform);
    rendererRef.current.draw(props.draw);
  }, [props.width, props.height, props.transform, props.draw, props.color]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: props.width,
        height: props.height,
        pointerEvents: "none",
      }}
      className={props.className}
    />
  );
};

// ---------------------------------------------------------------------------
// Snap guide
// ---------------------------------------------------------------------------

export interface SnapGuideProps {
  width: number;
  height: number;
  transform: cmath.Transform;
  snapping: SnapResult | undefined;
  color?: string;
  className?: string;
}

export const SnapGuide: React.FC<SnapGuideProps> = (props) => {
  const draw = React.useMemo(() => {
    const guideData = props.snapping ? guide.plot(props.snapping) : undefined;
    return snapGuideToHUDDraw(guideData);
  }, [props.snapping]);

  return <HUDOverlay {...props} draw={draw} />;
};

// ---------------------------------------------------------------------------
// Measurement guide
// ---------------------------------------------------------------------------

export interface MeasurementGuideProps {
  width: number;
  height: number;
  transform: cmath.Transform;
  measurement: Measurement | undefined;
  color?: string;
  className?: string;
}

export const MeasurementGuide: React.FC<MeasurementGuideProps> = (props) => {
  const draw = React.useMemo(
    () =>
      props.measurement ? measurementToHUDDraw(props.measurement) : undefined,
    [props.measurement]
  );

  return <HUDOverlay {...props} draw={draw} />;
};

// ---------------------------------------------------------------------------
// Marquee
// ---------------------------------------------------------------------------

export interface MarqueeProps {
  width: number;
  height: number;
  transform: cmath.Transform;
  a: cmath.Vector2 | undefined;
  b: cmath.Vector2 | undefined;
  color?: string;
  className?: string;
}

export const Marquee: React.FC<MarqueeProps> = (props) => {
  const draw = React.useMemo(
    () => (props.a && props.b ? marqueeToHUDDraw(props.a, props.b) : undefined),
    [props.a, props.b]
  );

  return <HUDOverlay {...props} draw={draw} />;
};

// ---------------------------------------------------------------------------
// Lasso
// ---------------------------------------------------------------------------

export interface LassoProps {
  width: number;
  height: number;
  transform: cmath.Transform;
  points: cmath.Vector2[] | undefined;
  color?: string;
  className?: string;
}

export const Lasso: React.FC<LassoProps> = (props) => {
  const draw = React.useMemo(
    () => (props.points ? lassoToHUDDraw(props.points) : undefined),
    [props.points]
  );

  return <HUDOverlay {...props} draw={draw} />;
};
