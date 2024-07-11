import { useEffect, useCallback, useRef } from "react";
import type { MapRef } from "react-map-gl";
import type { PaddingOptions } from "mapbox-gl";

/**
 *
 * @param latitude
 * @param longitude
 * @param maxDisplacement 1 = 111km (1 degree of latitude)
 * @returns
 */
export function getRandomDisplacement(
  point: { latitude: number; longitude: number },
  maxDisplacement = 0.1
) {
  const { latitude, longitude } = point;
  const randomOffset = () => (Math.random() - 0.5) * 2 * maxDisplacement;

  let newLatitude = latitude + randomOffset();
  let newLongitude = longitude + randomOffset();

  // Ensure the latitude stays within the range of -90 to 90
  if (newLatitude > 90) newLatitude = 90;
  if (newLatitude < -90) newLatitude = -90;

  // Ensure the longitude stays within the range of -180 to 180
  if (newLongitude > 180) newLongitude = 180;
  if (newLongitude < -180) newLongitude = -180;

  return {
    latitude: newLatitude,
    longitude: newLongitude,
  };
}

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

function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in kilometers
  return distance;
}

export function useUxMapFocus(
  map: MapRef | undefined,
  mapPadding: PaddingOptions,
  movementInterval: number = 1000,
  zoomInterval: number = 3000,
  zoomThreshold: number = 10 // distance threshold in kilometers
) {
  const lastZoomRef = useRef<number>(3);
  const lastPointRef = useRef<{ longitude: number; latitude: number } | null>(
    null
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const throttledFlyTo = useThrottledWithInitialTrigger(
    (longitude: number, latitude: number) => {
      if (!map) return;

      if (lastPointRef.current) {
        const distance = calculateDistance(
          lastPointRef.current.latitude,
          lastPointRef.current.longitude,
          latitude,
          longitude
        );

        map.flyTo({
          padding: mapPadding,
          center: [longitude, latitude],
          zoom: distance > zoomThreshold ? 3 : lastZoomRef.current,
        });
      } else {
        lastZoomRef.current = 3;

        map.flyTo({
          padding: mapPadding,
          center: [longitude, latitude],
          zoom: lastZoomRef.current,
        });
      }

      lastPointRef.current = {
        longitude: longitude,
        latitude: latitude,
      };
    },
    movementInterval
  );

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      if (lastPointRef.current && map) {
        lastZoomRef.current = 13;
        map.flyTo({
          center: [
            lastPointRef.current.longitude,
            lastPointRef.current.latitude,
          ],
          zoom: lastZoomRef.current,
          duration: 5000,
        });
      }
    }, zoomInterval);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [lastPointRef.current, map, zoomInterval]);

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
