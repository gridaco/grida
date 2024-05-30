"use client";

import { Customers, Responses } from "@/scaffolds/analytics/stats";
import { FormResponsesProvider } from "@/scaffolds/editor";
import { MapGL } from "@/theme/templates/formstart/default/mapgl";
import React, { useEffect, useState } from "react";
import { MapProvider, useMap } from "react-map-gl";
import { useDarkMode } from "usehooks-ts";

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
  const map = useMap();

  useEffect(() => {
    console.log("map", map);
    setTimeout(() => {
      map.current?.flyTo({
        center: [0, 0],
        zoom: 10,
      });
    }, 1000);
  }, [map]);
  return (
    <main className="relative p-4 h-full">
      <div className="absolute top-0 left-0 right-0 bottom-0">
        <div className="w-full h-full">
          <MapGL
            mapStyle={
              isDarkMode
                ? "mapbox://styles/mapbox/dark-v11"
                : "mapbox://styles/mapbox/light-v11"
            }
            interactive
            latitude={0}
            longitude={0}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
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
