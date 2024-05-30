"use client";

import clsx from "clsx";
import Map from "react-map-gl";

const MAPBOX_ACCESS_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

type MapStyle =
  | "mapbox://styles/mapbox/streets-v12"
  | "mapbox://styles/mapbox/outdoors-v12"
  | "mapbox://styles/mapbox/light-v11"
  | "mapbox://styles/mapbox/dark-v11"
  | "mapbox://styles/mapbox/satellite-v9"
  | "mapbox://styles/mapbox/satellite-streets-v12"
  | "mapbox://styles/mapbox/navigation-day-v1"
  | "mapbox://styles/mapbox/navigation-night-v1"
  | (string & {});

export function MapGL({
  className,
  mapStyle = "mapbox://styles/mapbox/light-v11",
  latitude,
  longitude,
  zoom = 2,
  interactive,
}: {
  zoom?: number;
  className?: string;
  longitude: number;
  mapStyle?: MapStyle;
  latitude: number;
  interactive?: boolean;
}) {
  return (
    <div className={clsx("flex flex-col overflow-hidden h-full", className)}>
      <Map
        mapboxAccessToken={MAPBOX_ACCESS_TOKEN}
        interactive={interactive}
        mapLib={import("mapbox-gl")}
        attributionControl={false}
        initialViewState={{
          longitude: longitude,
          latitude: latitude,
          zoom: zoom,
        }}
        style={{
          width: "100%",
          flex: 1,
        }}
        mapStyle={mapStyle}
      />
    </div>
  );
}
