"use client";

import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@app/ui/lib/utils";
import { ImageCamera } from "@/lib/image-camera";

// Per-wheel-unit zoom sensitivity for pinch / Cmd-wheel. Mirrors the
// `@grida/svg-editor` WHEEL_PAN_ZOOM default (src/gestures/defaults.ts).
const WHEEL_ZOOM_SENSITIVITY = 0.01;

/**
 * DOM binding for an {@link ImageCamera}: pinch / Cmd-wheel zoom, two-finger
 * scroll or pointer-drag pan, and double-click fit toggling.
 */
export function ZoomableImage({
  src,
  alt,
  className,
  imageClassName,
  onError,
  onBackgroundClick,
}: {
  src: string;
  alt: string;
  className?: string;
  imageClassName?: string;
  onError?: () => void;
  onBackgroundClick?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const sizeRef = useRef<{ width: number; height: number } | null>(null);
  const naturalRef = useRef<{ width: number; height: number } | null>(null);
  const [camera, setCamera] = useState<ImageCamera | null>(null);
  const [panning, setPanning] = useState(false);
  const drag = useRef<{
    x: number;
    y: number;
    camera: ImageCamera;
  } | null>(null);
  // Pointer capture retargets the click synthesized after a drag to the
  // container. Suppress that one click so an image pan cannot be mistaken for
  // an empty-surface click.
  const suppressBackgroundClick = useRef(false);

  const geometry = () => {
    const size = sizeRef.current;
    const natural = naturalRef.current;
    return size && natural
      ? {
          containerWidth: size.width,
          containerHeight: size.height,
          naturalWidth: natural.width,
          naturalHeight: natural.height,
        }
      : null;
  };

  // New image → forget the old natural size and re-fit on the next load.
  useEffect(() => {
    naturalRef.current = null;
    setCamera(null);
  }, [src]);

  // Track container size; re-clamp (or initialise) the camera on resize.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      // Measure the layout box, not transformed visual bounds. Dialogs animate
      // through a scale transform, and fitting to getBoundingClientRect() during
      // that animation leaves the settled image offset toward the top-left.
      sizeRef.current = {
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      };
      const measured = geometry();
      if (measured) {
        setCamera((previous) =>
          previous ? previous.resize(measured) : ImageCamera.fit(measured)
        );
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const onLoad = () => {
    const image = imgRef.current;
    if (!image) return;
    naturalRef.current = {
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
    if (!sizeRef.current && containerRef.current) {
      sizeRef.current = {
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      };
    }
    const measured = geometry();
    if (measured) setCamera(ImageCamera.fit(measured));
  };

  // A non-passive native listener is required to prevent page scrolling.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (!geometry()) return;
      const rect = element.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) {
        const px = event.clientX - rect.left;
        const py = event.clientY - rect.top;
        setCamera((previous) =>
          previous
            ? previous.zoomAt(
                previous.scale * (1 - event.deltaY * WHEEL_ZOOM_SENSITIVITY),
                px,
                py
              )
            : previous
        );
      } else {
        setCamera((previous) =>
          previous ? previous.panBy(-event.deltaX, -event.deltaY) : previous
        );
      }
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  const pannable = camera?.pannable ?? false;

  const onPointerDown = (event: ReactPointerEvent) => {
    // Empty-surface clicks and image pan gestures remain independent.
    if (onBackgroundClick && event.target === event.currentTarget) return;
    if (!pannable || !camera) return;
    if (onBackgroundClick) suppressBackgroundClick.current = true;
    containerRef.current?.setPointerCapture(event.pointerId);
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      camera,
    };
    setPanning(true);
  };
  const onPointerMove = (event: ReactPointerEvent) => {
    const start = drag.current;
    if (!start) return;
    setCamera(
      start.camera.panBy(event.clientX - start.x, event.clientY - start.y)
    );
  };
  const endPan = (event: ReactPointerEvent) => {
    drag.current = null;
    setPanning(false);
    const element = containerRef.current;
    if (element?.hasPointerCapture(event.pointerId)) {
      element.releasePointerCapture(event.pointerId);
    }
    setTimeout(() => {
      suppressBackgroundClick.current = false;
    }, 0);
  };

  const onDoubleClick = (event: ReactMouseEvent) => {
    const element = containerRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    setCamera((previous) =>
      previous ? previous.toggleZoomAt(px, py) : previous
    );
  };

  const cursor = pannable ? (panning ? "grabbing" : "grab") : "default";

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative h-full w-full overflow-hidden bg-muted/30",
        className
      )}
      style={{
        touchAction: "none",
        cursor: onBackgroundClick ? "default" : cursor,
      }}
      onClick={(event) => {
        if (suppressBackgroundClick.current) {
          suppressBackgroundClick.current = false;
          return;
        }
        if (event.target === event.currentTarget) onBackgroundClick?.();
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onDoubleClick={onDoubleClick}
    >
      {/* Natural-size image, positioned entirely by the measured camera.
          Opacity avoids a full-size flash while preserving an ancestor's
          `visibility: hidden` when the Files tab is inactive. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        decoding="async"
        className={cn(
          "absolute left-0 top-0 max-w-none select-none",
          imageClassName
        )}
        draggable={false}
        onLoad={onLoad}
        onError={onError}
        style={{
          transform: camera?.transform,
          transformOrigin: "0 0",
          opacity: camera ? 1 : 0,
          willChange: "transform",
          cursor: onBackgroundClick ? cursor : undefined,
        }}
      />
    </div>
  );
}
