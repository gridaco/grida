"use client";

import clsx from "clsx";
import React from "react";
import Map, { ViewState } from "react-map-gl";

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
  id,
  className,
  mapStyle = "mapbox://styles/mapbox/light-v11",
  initialViewState,
  interactive,
  children,
}: React.PropsWithChildren<{
  id?: string;
  className?: string;
  mapStyle?: MapStyle;
  interactive?: boolean;
  initialViewState?: Partial<ViewState>;
}>) {
  return (
    <div className={clsx("flex flex-col overflow-hidden h-full", className)}>
      <Map
        id={id}
        mapboxAccessToken={MAPBOX_ACCESS_TOKEN}
        interactive={interactive}
        mapLib={import("mapbox-gl")}
        attributionControl={false}
        initialViewState={initialViewState}
        style={{
          width: "100%",
          flex: 1,
        }}
        mapStyle={mapStyle}
      >
        {children}
      </Map>
    </div>
  );
}
