"use client";

import clsx from "clsx";
import Map from "react-map-gl";

const MAPBOX_ACCESS_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

export function MapGL({
  className,
  longitude,
  mapStyle = "mapbox://styles/mapbox/light-v11",
  latitude,
}: {
  className?: string;
  longitude: number;
  mapStyle?: string;
  latitude: number;
}) {
  return (
    <div className={clsx("flex flex-col overflow-hidden", className)}>
      <Map
        mapboxAccessToken={MAPBOX_ACCESS_TOKEN}
        interactive={false}
        mapLib={import("mapbox-gl")}
        attributionControl={false}
        initialViewState={{
          longitude: longitude,
          latitude: latitude,
          zoom: 3.5,
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
