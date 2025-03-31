"use client";

import { fmtnum } from "@/scaffolds/analytics/stats";
import { MapGL } from "@/components/mapgl";
import React, { useEffect, useMemo, useState } from "react";
import { MapProvider, useMap } from "react-map-gl";
import { useDarkMode } from "usehooks-ts";
import { useWindowSize } from "@uidotdev/usehooks";
import { Source, Layer } from "react-map-gl";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import TimeSeriesChart from "@/scaffolds/analytics/charts/timeseries";
import { format } from "date-fns";
import { useUxInitialTransform, useUxMapFocus } from "./use-ux-map-focus";
import { useUxMapDisplacement } from "./use-ux-map-displacement";
import type { CircleLayerSpecification } from "mapbox-gl";
import type { FeatureCollection } from "geojson";
import { Analytics } from "@/lib/analytics";

const layerstyles: {
  light: CircleLayerSpecification;
  dark: CircleLayerSpecification;
} = {
  light: {
    id: "point",
    source: "my-data",
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
    source: "my-data",
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

const useOverscrollBehaviourXNone = () => {
  useEffect(() => {
    document.body.style.overscrollBehaviorX = "none";

    return () => {
      document.body.style.overscrollBehaviorX = "";
    };
  }, []);
};

export default function LiveWorldAnalytics({
  eventStreams,
  tickInterval = 1000 * 15, // updates every 15 seconds
}: {
  eventStreams: Analytics.EventStream[];
  tickInterval?: number;
}) {
  useOverscrollBehaviourXNone();
  return (
    <MapProvider>
      <View eventStreams={eventStreams} tickInterval={tickInterval} />
    </MapProvider>
  );
}

function useCurrentTime(tickInterval: number): Date {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), tickInterval);
    return () => clearInterval(timer);
  }, [tickInterval]);
  return now;
}

function View({
  eventStreams,
  tickInterval,
}: {
  eventStreams: Analytics.EventStream[];
  tickInterval: number;
}) {
  const { isDarkMode } = useDarkMode();
  const { map } = useMap();
  const size = useWindowSize();
  const now = useCurrentTime(tickInterval);

  const geoData = useMemo(() => {
    return eventStreams
      .filter((stream) => stream.showonmap)
      .flatMap((stream) =>
        stream.data
          .filter((r) => r.geo !== null)
          .map((r) => ({
            id: r.id,
            latitude: r.geo!.latitude,
            longitude: r.geo!.longitude,
          }))
      );
  }, [eventStreams]);

  const geoPoints = useUxMapDisplacement(geoData, 0.005);

  const lastGeoPoint: (typeof geoPoints)[number] | undefined = useMemo(
    () => geoPoints[geoPoints.length - 1],
    [geoPoints]
  );

  const mapPadding = useMemo(
    () => ({
      top: 0,
      bottom: 0,
      left: (size.width || 1000) * 0.4,
      right: 0,
    }),
    [size.width]
  );

  const geojson: FeatureCollection = useMemo(
    () => ({
      type: "FeatureCollection",
      features: geoPoints.map((r) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [r.longitude, r.latitude],
        },
        properties: { id: r.id },
      })),
    }),
    [geoPoints]
  );

  useUxInitialTransform(map, size);
  // const debounceFlyTo = useUxMapFocus(map, mapPadding, 1000, 3000);
  const debounceFlyTo = useUxMapFocus(map, mapPadding, 1000, 5000, 10); // Adjust intervals and threshold as needed

  const charts: Analytics.EventStreamSerialChart[] = useMemo(() => {
    return eventStreams.flatMap((stream) => {
      const series = Analytics.serialize(
        stream.data.map((e) => ({ ...e, at: e.at })),
        {
          dateKey: "at",
          from: new Date(now.getTime() - 15 * 60 * 1000),
          to: now,
          interval: 15 * 1000,
        }
      );
      return {
        name: stream.name,
        description: stream.description,
        data: series,
      } satisfies Analytics.EventStreamSerialChart;
    });
  }, [eventStreams, now]);

  useEffect(() => {
    if (lastGeoPoint) {
      debounceFlyTo(lastGeoPoint.longitude, lastGeoPoint.latitude);
    }
  }, [lastGeoPoint]);

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
        {charts.map((chart) => (
          <div key={chart.name} className="pointer-events-auto">
            <EventStreamChartCard
              title={chart.name}
              subtitle={chart.description}
              data={chart.data}
            />
          </div>
        ))}
      </div>
    </main>
  );
}

function EventStreamChartCard({
  title,
  subtitle,
  data,
}: {
  title: string;
  subtitle: string;
  data: { count: number; date: Date }[];
}) {
  return (
    <Card className="overflow-hidden bg-white/10 dark:bg-black/10 backdrop-blur-lg">
      <CardHeader>
        <header>
          <h1 className="text-lg font-semibold">{title}</h1>
          <h6 className="text-sm text-muted-foreground">{subtitle}</h6>
        </header>
        <div className="mt-4 flex items-center space-x-2">
          <span className="text-3xl font-bold">
            {fmtnum(data.reduce((sum, item) => sum + item.count, 0))}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <TimeSeriesChart
          data={data}
          type="step"
          datefmt={(date) => format(date, "HH:mm:ss.SSS")}
        />
      </CardContent>
    </Card>
  );
}
