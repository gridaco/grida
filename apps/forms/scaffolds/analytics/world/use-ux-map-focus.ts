import { useEffect, useCallback, useRef } from "react";
import type { MapRef } from "react-map-gl";
import type { PaddingOptions } from "mapbox-gl";

function useThrottledWithInitialTrigger<T extends (...args: any[]) => void>(
  callback: T,
  interval: number
): (...args: Parameters<T>) => void {
  const callbackRef = useRef(callback);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCallTimeRef = useRef<number | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const throttledCallback = useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();

      if (
        lastCallTimeRef.current === null ||
        now - lastCallTimeRef.current >= interval
      ) {
        callbackRef.current(...args);
        lastCallTimeRef.current = now;
      } else {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(
          () => {
            callbackRef.current(...args);
            lastCallTimeRef.current = Date.now();
          },
          interval - (now - lastCallTimeRef.current)
        );
      }
    },
    [interval]
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return throttledCallback;
}

export function useUxMapFocus(
  map: MapRef | undefined,
  mapPadding: PaddingOptions,
  interval: number = 300
) {
  const throttledFlyTo = useThrottledWithInitialTrigger(
    (longitude: number, latitude: number) => {
      if (map) {
        map.flyTo({
          padding: mapPadding,
          center: [longitude, latitude],
          zoom: 3,
        });
      }
    },
    interval
  );

  return throttledFlyTo;
}

export function useUxInitialTransform(
  map?: MapRef,
  size?: { width?: number | null }
) {
  const isInitiallyTransformed = useRef(false);
  const width = size?.width;
  useEffect(() => {
    if (map && !isInitiallyTransformed.current) {
      map.setCenter([180, 90]);
      map.setZoom(0);
      map.setBearing(30);
      map.setPitch(10);
      map.setPadding({
        left: (width || 1000) / 2,
        right: 0,
        top: 0,
        bottom: 0,
      });
      setTimeout(() => {
        map.flyTo({
          zoom: 3,
          center: [0, 0],
          bearing: 0,
          pitch: 0,
        });
      }, 100);
      isInitiallyTransformed.current = true;
    }
  }, [map, width]);
}
