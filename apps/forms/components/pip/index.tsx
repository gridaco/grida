"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/utils";
import { useDrag } from "@use-gesture/react";
import { useMeasure, useThrottle } from "@uidotdev/usehooks";

function safepos(
  pos: { x: number; y: number },
  parent: { width: number; height: number },
  child: { width: number; height: number }
) {
  const maxX = Math.max(0, parent.width - child.width);
  const maxY = Math.max(0, parent.height - child.height);
  const minX = 0;
  const minY = 0;

  // x and y cannot be negative nor greater than the screen width and height
  const x = Math.max(minX, Math.min(maxX, pos.x));
  const y = Math.max(minY, Math.min(maxY, pos.y));

  return { x, y };
}

interface Size {
  width: number;
  height: number;
}

export function PictureInPicture({
  children,
  className,
  padding,
}: React.PropsWithChildren<{
  className?: string;
  padding?: number;
}>) {
  // const container = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const [position, setPosition] = useState({ x: -1, y: -1 });
  // const childref = React.useRef<HTMLDivElement>(null);
  // const containersize = useSize(container.current);
  // const size = useSize(childref.current);
  const [container, _containersize] = useMeasure();
  const [childref, _size] = useMeasure();

  const containersize =
    _containersize.height && _containersize.width
      ? (_containersize as Size)
      : null;
  const size = _size.height && _size.width ? (_size as Size) : null;

  const setSafePosition = (x: number, y: number) => {
    if (!containersize || !size) return;
    setPosition(
      safepos(
        { x, y },
        { width: containersize.width, height: containersize.height },
        size
      )
    );
  };

  // Bind the drag gesture
  const bind = useDrag(({ event }) => {
    setSafePosition(
      (event as MouseEvent).clientX,
      (event as MouseEvent).clientY
    );
  });

  const safeposition = useMemo(() => {
    if (!size || !containersize) return { x: 0, y: 0 };
    return safepos(
      position,
      { width: containersize.width ?? 0, height: containersize.height ?? 0 },
      size
    );
  }, [containersize, position, size]);

  // on resize
  useEffect(() => {
    if (!containersize || !size) return;
    if (!initialized.current) {
      // initial position
      setPosition({
        x: 0,
        y: containersize.height,
      });
      initialized.current = true;
    } else {
      setSafePosition(position.x, position.y);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containersize, size]);

  const safeposthrottled = useThrottle(safeposition, 50);

  const style =
    containersize && size
      ? {
          position: "absolute" as const,
          transform: `translate3d(${safeposthrottled.x}px, ${safeposthrottled.y}px, 0)`,
          willChange: "transform",
        }
      : {
          position: "absolute" as const,
          transform: `translate3d(-100px, ${screen.height}px, 0)`,
          willChange: "transform",
        };

  return (
    <div
      className="fixed z-50 inset-0 pointer-events-none select-none"
      style={{
        padding,
      }}
    >
      <div className="w-full h-full" ref={container}>
        <div
          {...bind()}
          className="pointer-events-auto touch-none transition-transform"
          style={style}
        >
          <Card
            ref={childref}
            className={cn("overflow-hidden", className)}
            style={{}}
          >
            {children}
          </Card>
        </div>
      </div>
      {/* <div className="fixed top-0 right-0 bg-black text-white w-96">
        <pre className="text-xs">
          {JSON.stringify(
            {
              size,
              containersize,
              position,
              safeposition,
            },
            null,
            2
          )}
        </pre>
      </div> */}
    </div>
  );
}
