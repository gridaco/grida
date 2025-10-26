import { useGesture as __useGesture, useGesture } from "@use-gesture/react";
import { useRef } from "react";

export function useSurfaceGesture(
  {
    onClick,
    onDoubleClick,
    onDragStart,
    onDragEnd,
    ...handlers
  }: Parameters<typeof __useGesture>[0],
  config?: Parameters<typeof __useGesture>[1]
) {
  // click / double click triggers when drag ends (if double pointer down) - it might be a better idea to prevent it with the displacement, not by delayed flag
  const should_prevent_click = useRef(false);

  return __useGesture(
    {
      onClick: (e) => {
        if (should_prevent_click.current) {
          return;
        }
        onClick?.(e);
      },
      onDoubleClick: (e) => {
        if (should_prevent_click.current) {
          return;
        }
        onDoubleClick?.(e);
      },
      ...handlers,
      onDragStart: (e) => {
        onDragStart?.(e);
        should_prevent_click.current = true;
      },
      onDragEnd: (e) => {
        onDragEnd?.(e);
        setTimeout(() => {
          should_prevent_click.current = false;
        }, 100);
      },
    },
    config
  );
}
