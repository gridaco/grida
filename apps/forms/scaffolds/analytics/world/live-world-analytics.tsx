"use client";

import { fmtnum } from "@/scaffolds/analytics/stats";
import { useEditorState } from "@/scaffolds/editor";
import {
  ResponseFeedProvider,
  ResponseSessionFeedProvider,
} from "@/scaffolds/editor/feed";
import { MapGL } from "@/theme/templates/formstart/default/mapgl";
import React, { useEffect, useMemo, useState } from "react";
import { MapProvider, useMap } from "react-map-gl";
import { useDarkMode } from "usehooks-ts";
import { useWindowSize } from "@uidotdev/usehooks";
import type { CircleLayer, MapRef } from "react-map-gl";
import { Source, Layer } from "react-map-gl";
import type { FeatureCollection } from "geojson";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import TimeSeriesChart from "@/scaffolds/analytics/charts/timeseries";
import {
  getRandomDisplacement,
  useUxInitialTransform,
  useUxMapFocus,
} from "./use-ux-map-focus";
import { serialize } from "../charts/serialize";
import { format } from "date-fns";

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
    <DisableSwipeBack>
      <ResponseFeedProvider>
        <ResponseSessionFeedProvider forceEnableRealtime>
          <MapProvider>
            <View />
          </MapProvider>
        </ResponseSessionFeedProvider>
      </ResponseFeedProvider>
    </DisableSwipeBack>
  );
}

const RECENT_N = 50;

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
  const [displaced, setDisplaced] = useState<Response[]>([]);
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
  // const debounceFlyTo = useUxMapFocus(map, mapPadding, 1000, 3000);
  const debounceFlyTo = useUxMapFocus(map, mapPadding, 1000, 5000, 10); // Adjust intervals and threshold as needed

  const geojson: FeatureCollection = useMemo(
    () => ({
      type: "FeatureCollection",
      features: displaced.map((r) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [r.longitude, r.latitude] },
        properties: { id: r.id },
      })),
    }),
    [displaced]
  );

  useEffect(() => {
    if (state.responses && state.responses.rows.length > 0) {
      const sorted = state.responses.rows
        .slice()
        .sort((a, b) => a.local_index - b.local_index);

      const recent = sorted.slice(-RECENT_N).map((r) => {
        return {
          id: r.id,
          at: new Date(r.created_at),
          latitude: Number(r.geo?.latitude) || 0,
          longitude: Number(r.geo?.longitude) || 0,
        };
      });
      setRecent(recent);
    }
  }, [state.responses]);

  useEffect(() => {
    if (recent.length === 0) return;
    const _displaced = recent.map((r) => {
      // if already displaced, skip
      const done = displaced.find((d) => d.id === r.id);
      if (done) {
        return done;
      }

      const { latitude, longitude } = getRandomDisplacement(
        {
          latitude: r.latitude,
          longitude: r.longitude,
        },
        0.005 // approx 500m
      );

      return {
        ...r,
        latitude: latitude,
        longitude: longitude,
      };
    });

    setDisplaced(_displaced);

    const last = _displaced[_displaced.length - 1];

    debounceFlyTo(last.longitude, last.latitude);
  }, [debounceFlyTo, recent]);

  const responseChartData = useMemo(() => {
    return serialize(state.responses?.rows || [], {
      dateKey: "created_at",
      // last 15 minutes
      from: new Date(new Date().getTime() - 15 * 60 * 1000),
      to: new Date(),
      intervalMs: 15 * 1000, // 15 seconds
    });
  }, [state.responses]);

  const sessionChartData = useMemo(() => {
    return serialize(state.sessions || [], {
      dateKey: "created_at",
      // last 15 minutes
      from: new Date(new Date().getTime() - 15 * 60 * 1000),
      to: new Date(),
      intervalMs: 15 * 1000, // 15 seconds
    });
  }, [state.sessions]);

  return (
    <main className="relative p-4 w-full h-full">
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
      <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4 z-0 pointer-events-none">
        <div className="pointer-events-auto">
          <Responses data={responseChartData} />
        </div>
        <div className="pointer-events-auto">
          <Sessions data={sessionChartData} />
        </div>
      </div>
    </main>
  );
}

function Responses({ data }: { data: { count: number; date: Date }[] }) {
  return (
    <Card className="overflow-hidden bg-white/10 dark:bg-black/10 backdrop-blur-lg">
      <CardHeader>
        <header>
          <h1 className="text-lg font-semibold">Responses</h1>
          <h6 className="text-sm text-muted-foreground">
            Responses in Last 15 Minutes
          </h6>
        </header>
        <div className="mt-4 flex items-center space-x-2">
          <span className="text-3xl font-bold">
            {fmtnum(data.reduce((sum, item) => sum + item.count, 0))}
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-0 h-40 w-full">
        <TimeSeriesChart
          data={data}
          chartType="bar"
          datefmt={(date) => format(date, "HH:mm:ss.SSS")}
        />
      </CardContent>
    </Card>
  );
}

function Sessions({ data }: { data: { count: number; date: Date }[] }) {
  return (
    <Card className="overflow-hidden bg-white/10 dark:bg-black/10 backdrop-blur-lg">
      <CardHeader>
        <header>
          <h1 className="text-lg font-semibold">Sessions</h1>
          <h6 className="text-sm text-muted-foreground">
            Sessions in Last 15 Minutes
          </h6>
        </header>
        <div className="mt-4 flex items-center space-x-2">
          <span className="text-3xl font-bold">
            {fmtnum(data.reduce((sum, item) => sum + item.count, 0))}
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-0 h-40 w-full">
        <TimeSeriesChart
          data={data}
          chartType="bar"
          datefmt={(date) => format(date, "HH:mm:ss.SSS")}
        />
      </CardContent>
    </Card>
  );
}
