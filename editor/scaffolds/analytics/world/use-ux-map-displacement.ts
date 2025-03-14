import { useEffect, useState } from "react";

type GeoPoint = {
  id: string;
  latitude: number;
  longitude: number;
};

/**
 *
 * @param latitude
 * @param longitude
 * @param maxDisplacement 1 = 111km (1 degree of latitude)
 * @returns
 */
export function getRandomDisplacement(point: GeoPoint, maxDisplacement = 0.1) {
  const { id, latitude, longitude } = point;
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
    id,
    latitude: newLatitude,
    longitude: newLongitude,
  };
}

export function useUxMapDisplacement(
  data: GeoPoint[],
  displacementRadius = 0.005
) {
  const [displaced, setDisplaced] = useState<GeoPoint[]>([]);

  useEffect(() => {
    if (!data.length) return;
    setDisplaced((prev) =>
      data.map((item) => {
        const existing = prev.find((d) => d.id === item.id);
        if (existing) return existing;
        const { latitude, longitude } = getRandomDisplacement(
          {
            id: item.id,
            latitude: item.latitude,
            longitude: item.longitude,
          },
          displacementRadius
        );
        return { ...item, latitude, longitude };
      })
    );
  }, [data, displacementRadius]);

  return displaced;
}
