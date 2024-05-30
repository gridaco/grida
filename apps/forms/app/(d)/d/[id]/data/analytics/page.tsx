"use client";

import { Customers, Responses } from "@/scaffolds/analytics/stats";
import { FormResponsesProvider } from "@/scaffolds/editor";
import { MapGL } from "@/theme/templates/formstart/default/mapgl";
import React, { useEffect, useState } from "react";
import { MapProvider, useMap } from "react-map-gl";
import { useDarkMode } from "usehooks-ts";
import { useWindowSize } from "@uidotdev/usehooks";
import type { CircleLayer } from "react-map-gl";
import { Source, Layer } from "react-map-gl";
import type { FeatureCollection } from "geojson";

const geojson: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-122.4, 37.8] },
      properties: { name: "San Francisco" },
    },
  ],
};

const layerstyles: { light: CircleLayer; dark: CircleLayer } = {
  light: {
    id: "point",
    type: "circle",
    paint: {
      "circle-radius": 10,
      "circle-opacity-transition": { duration: 1000 },
      "circle-opacity": 0.6,
      "circle-color": "black",
      "circle-stroke-width": 2,
      "circle-stroke-color": "white",
      "circle-stroke-opacity": 0.8,
    },
  },
  dark: {
    id: "point",
    type: "circle",
    paint: {
      "circle-radius": 10,
      "circle-opacity-transition": { duration: 1000 },
      "circle-opacity": 0.9,
      "circle-color": "white",
      "circle-stroke-width": 2,
      "circle-stroke-color": "black",
      "circle-stroke-opacity": 0.8,
    },
  },
};

const DisableSwipeBack = ({ children }: React.PropsWithChildren<{}>) => {
  useEffect(() => {
    document.body.style.overscrollBehaviorX = "none";

    return () => {
      document.body.style.overscrollBehaviorX = "";
    };
  }, []);

  return <>{children}</>;
};

export default function DataAnalyticsPage() {
  return (
    <MapProvider>
      <DisableSwipeBack>
        <FormResponsesProvider>
          <View />
        </FormResponsesProvider>
      </DisableSwipeBack>
    </MapProvider>
  );
}

function View() {
  const { isDarkMode } = useDarkMode();
  const { map } = useMap();
  const size = useWindowSize();

  useEffect(() => {
    console.log("map", map);
    setTimeout(() => {
      map?.flyTo({
        padding: {
          top: 0,
          bottom: 0,
          left: (size.width || 1000) * 0.4,
          right: 0,
        },
        center: [37.6173 + Math.random() * 0.1, 55.7558 + Math.random() * 0.1],
        zoom: 12,
      });
    }, 1000);
  }, [map]);

  return (
    <main className="relative p-4 h-full">
      <div className="absolute top-0 left-0 right-0 bottom-0">
        <div className="w-full h-full">
          <MapGL
            id="map"
            mapStyle={
              isDarkMode
                ? "mapbox://styles/mapbox/dark-v11"
                : "mapbox://styles/mapbox/light-v11"
            }
            interactive
            initialViewState={{
              latitude: 0,
              longitude: 0,
              zoom: 0,
              padding: {
                left: (size.width || 1000) / 2,
                right: 0,
                top: 0,
                bottom: 0,
              },
            }}
          >
            <Source id="my-data" type="geojson" data={geojson}>
              <Layer {...layerstyles[isDarkMode ? "dark" : "light"]} />
            </Source>
          </MapGL>
        </div>
      </div>
      <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4 z-10">
        <Customers
          project_id={2}
          from={new Date(new Date().setMonth(new Date().getMonth() - 3))}
          to={new Date()}
        />
        <Responses
          project_id={2}
          from={new Date(new Date().setMonth(new Date().getMonth() - 3))}
          to={new Date()}
        />
      </div>
    </main>
  );
}
