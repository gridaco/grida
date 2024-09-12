"use client";

import { TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Pie,
  PieChart,
  CartesianGrid,
  XAxis,
} from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCallback, useReducer, useState } from "react";
import produce from "immer";
import { ResourceTypeIcon } from "@/components/resource-type-icon";
import { CHART_PALETTES, DataChartPalette } from "./colors";

/// TODO:
// type switch
// color switch
// x
// x plot
// y
// y plot
// y group

type DataChartRendererType = "bar" | "area" | "pie";

interface ChartViewState {
  renderer: DataChartRendererType;
  palette: DataChartPalette;
}

type ChartViewAction =
  | { type: "type"; renderer: DataChartRendererType }
  | { type: "palette"; palette: DataChartPalette };

function reducer(state: ChartViewState, action: ChartViewAction) {
  switch (action.type) {
    case "type": {
      const { renderer } = action;
      return produce(state, (draft) => {
        draft.renderer = renderer;
      });
    }
    case "palette": {
      const { palette } = action;
      return produce(state, (draft) => {
        draft.palette = palette;
      });
    }
  }

  return state;
}

const chartData = [
  { month: "January", desktop: 186, mobile: 80 },
  { month: "February", desktop: 305, mobile: 200 },
  { month: "March", desktop: 237, mobile: 120 },
  { month: "April", desktop: 73, mobile: 190 },
  { month: "May", desktop: 209, mobile: 130 },
  { month: "June", desktop: 214, mobile: 140 },
];

const chartConfig = {
  desktop: {
    label: "Desktop",
    color: "hsl(var(--chart-1))",
  },
  mobile: {
    label: "Mobile",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;

export function Chartview() {
  const [state, dispatch] = useReducer(reducer, {
    renderer: "bar",
    palette: "slate",
  });

  const { renderer, palette } = state;

  const changeType = useCallback(
    (type: DataChartRendererType) => {
      dispatch({ type: "type", renderer: type });
    },
    [dispatch]
  );

  const changePalette = useCallback(
    (palette: DataChartPalette) => {
      dispatch({ type: "palette", palette: palette });
    },
    [dispatch]
  );

  return (
    <div className="w-full h-full p-4">
      <div className="flex gap-4">
        <div className="w-full">
          <DataChart
            type={renderer}
            defs={{
              mobile: {
                label: "Mobile",
                color: CHART_PALETTES[palette].colors[500],
              },
              desktop: {
                label: "Desktop",
                color: CHART_PALETTES[palette].colors[500],
              },
            }}
          />
        </div>
        <aside className="flex flex-col gap-4">
          <ChartTypeToggleGroup value={renderer} onValueChange={changeType} />
          <PaletteToggleGroup value={palette} onValueChange={changePalette} />
        </aside>
      </div>
    </div>
  );
}

function ChartTypeToggleGroup({
  value,
  onValueChange,
}: {
  value: DataChartRendererType;
  onValueChange?: (value: DataChartRendererType) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => {
        if (!v) return;
        onValueChange?.(v as DataChartRendererType);
      }}
    >
      <ToggleGroupItem value="bar">
        <ResourceTypeIcon type="chart-bar" className="w-4 h-4" />
        Bar
      </ToggleGroupItem>
      <ToggleGroupItem value="area">
        <ResourceTypeIcon type="chart-line" className="w-4 h-4" />
        Area
      </ToggleGroupItem>
      <ToggleGroupItem value="pie">
        <ResourceTypeIcon type="chart-pie" className="w-4 h-4" />
        Pie
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

function PaletteToggleGroup({
  value,
  onValueChange,
}: {
  value: DataChartPalette;
  onValueChange?: (value: DataChartPalette) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={onValueChange}
      className="flex-col"
    >
      {Object.entries(CHART_PALETTES).map(([key, { label, colors }]) => (
        <ToggleGroupItem key={key} value={key as DataChartPalette}>
          <span className="me-2">{label}</span>
          <div className="flex gap-1">
            {Object.entries(colors).map(([k, color]) => (
              <div
                key={k}
                className="w-4 h-4 rounded-sm"
                style={{
                  backgroundColor: color,
                }}
              />
            ))}
          </div>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function DataChart({
  type,
  defs,
}: {
  type: DataChartRendererType;
  defs: {
    [key: string]: {
      label: string;
      color: string;
    };
  };
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Title</CardTitle>
        <CardDescription>Description</CardDescription>
      </CardHeader>
      <CardContent>
        <>
          {type === "bar" && (
            <ChartContainer config={chartConfig}>
              <BarChart accessibilityLayer data={chartData}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  tickMargin={10}
                  axisLine={false}
                  tickFormatter={(value) => value.slice(0, 3)}
                />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent indicator="dashed" />}
                />
                <Bar dataKey="desktop" fill="var(--color-desktop)" radius={4} />
                <Bar dataKey="mobile" fill="var(--color-mobile)" radius={4} />
              </BarChart>
            </ChartContainer>
          )}
          {type === "area" && (
            <ChartContainer config={chartConfig}>
              <AreaChart
                accessibilityLayer
                data={chartData}
                margin={{
                  left: 12,
                  right: 12,
                }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={(value) => value.slice(0, 3)}
                />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent />}
                />
                <defs>
                  <linearGradient id="fillDesktop" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--color-desktop)"
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-desktop)"
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                  <linearGradient id="fillMobile" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--color-mobile)"
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-mobile)"
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                </defs>
                <Area
                  dataKey="mobile"
                  type="natural"
                  fill="url(#fillMobile)"
                  fillOpacity={0.4}
                  stroke="var(--color-mobile)"
                  stackId="a"
                />
                <Area
                  dataKey="desktop"
                  type="natural"
                  fill="url(#fillDesktop)"
                  fillOpacity={0.4}
                  stroke="var(--color-desktop)"
                  stackId="a"
                />
              </AreaChart>
            </ChartContainer>
          )}
          {type === "pie" && (
            <ChartContainer
              config={chartConfig}
              className="mx-auto aspect-square max-h-[250px]"
            >
              <PieChart>
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent hideLabel />}
                />
                <Pie
                  data={chartData}
                  dataKey="visitors"
                  nameKey="browser"
                  innerRadius={60}
                />
              </PieChart>
            </ChartContainer>
          )}
        </>
      </CardContent>
    </Card>
  );
}
