"use client";

import { fmtnum, serialize } from "@/scaffolds/analytics/stats";
import { FormResponsesProvider, useEditorState } from "@/scaffolds/editor";
import { MapGL } from "@/theme/templates/formstart/default/mapgl";
import React, { useEffect, useMemo, useState } from "react";
import { MapProvider, useMap } from "react-map-gl";
import { useDarkMode } from "usehooks-ts";
import { useWindowSize } from "@uidotdev/usehooks";
import type { CircleLayer, MapRef } from "react-map-gl";
import { Source, Layer } from "react-map-gl";
import type { FeatureCollection } from "geojson";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import LineChart from "@/scaffolds/analytics/charts/basic-line-chart";
import { useUxInitialTransform, useUxMapFocus } from "./use-ux-map-focus";

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

export default function LiveWorldAnalytics() {
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

const RECENT_N = 5;

interface Response {
  id: string;
  at: Date;
  latitude: number;
  longitude: number;
}

function View() {
  const { isDarkMode } = useDarkMode();
  const { map } = useMap();
  const size = useWindowSize();
  const [recent, setRecent] = useState<Response[]>([]);
  const mapPadding = useMemo(
    () => ({
      top: 0,
      bottom: 0,
      left: (size.width || 1000) * 0.4,
      right: 0,
    }),
    [size.width]
  );

  const [state] = useEditorState();
  useUxInitialTransform(map, size);
  const debounceFlyTo = useUxMapFocus(map, mapPadding, 1000);

  const geojson: FeatureCollection = useMemo(
    () => ({
      type: "FeatureCollection",
      features: recent.map((r) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [r.longitude, r.latitude] },
        properties: { id: r.id },
      })),
    }),
    [recent]
  );

  useEffect(() => {
    if (state.responses && state.responses.length > 0) {
      const sorted = state.responses
        .slice()
        .sort((a, b) => a.local_index - b.local_index);
      const recent = sorted.slice(-RECENT_N).map((r) => ({
        id: r.id,
        at: new Date(r.created_at),
        latitude: Number(r.geo?.latitude) || 0,
        longitude: Number(r.geo?.longitude) || 0,
      }));
      const last = recent[recent.length - 1];
      setRecent(recent);

      debounceFlyTo(last.longitude, last.latitude);
    }
  }, [state.responses, debounceFlyTo]);

  const chartdata = useMemo(() => {
    return serializeMs(state.responses || [], {
      dateKey: "created_at",
      // last 30 minutes
      from: new Date(new Date().getTime() - 30 * 60 * 1000),
      to: new Date(),
      intervalMs: 60 * 1000,
    });
  }, [state.responses]);

  console.log(recent, chartdata);

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
          >
            <Source id="my-data" type="geojson" data={geojson}>
              <Layer {...layerstyles[isDarkMode ? "dark" : "light"]} />
            </Source>
          </MapGL>
        </div>
      </div>
      <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4 z-10">
        {/* @ts-ignore */}
        <Responses data={chartdata} />
      </div>
    </main>
  );
}

function Responses({ data }: { data: { count: number; date: Date }[] }) {
  return (
    <Card className="overflow-hidden bg-white/10 dark:bg-black/10 backdrop-blur-lg">
      <CardHeader>
        <h1 className="text-lg font-semibold">Responses</h1>
        <div className="flex items-center space-x-2">
          <span className="text-3xl font-bold">
            {fmtnum(data.reduce((sum, item) => sum + item.count, 0))}
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-0 h-40 w-full">
        <LineChart data={data} />
      </CardContent>
    </Card>
  );
}

export function serializeMs<T extends Record<string, any>>(
  data: Array<T>,
  {
    from,
    to,
    dateKey,
    intervalMs,
  }: {
    from: Date;
    to: Date;
    dateKey: keyof T;
    intervalMs: number;
  }
) {
  // Step 1: Create a map for the new data with the provided dates range
  const dateMap: Record<string, number> = {};
  let currentDate = new Date(from.getTime());
  while (currentDate <= to) {
    const dateString = new Date(
      Math.floor(currentDate.getTime() / intervalMs) * intervalMs
    ).toISOString();
    dateMap[dateString] = 0;
    currentDate = new Date(currentDate.getTime() + intervalMs); // Move to the next interval
  }

  // Step 2: Populate the map with actual data
  data.forEach((item) => {
    const dateValue = item[dateKey];
    if (typeof dateValue === "string" || (dateValue as any) instanceof Date) {
      const date = new Date(dateValue).toISOString();
      const roundedDate = new Date(
        Math.floor(new Date(date).getTime() / intervalMs) * intervalMs
      ).toISOString();
      if (dateMap[roundedDate] !== undefined) {
        dateMap[roundedDate]++;
      }
    }
  });

  // Step 3: Format the data for output
  const formattedData = Object.entries(dateMap).map(([date, count]) => ({
    date,
    count,
  }));

  return formattedData;
}
