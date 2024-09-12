"use client";

import { TrendingUp } from "lucide-react";
import {
  Label,
  Area,
  AreaChart,
  Bar,
  BarChart,
  Pie,
  PieChart,
  CartesianGrid,
  XAxis,
  YAxis,
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
import { CHART_PALETTES, DataChartPalette, STANDARD_PALETTES } from "./colors";

/// TODO:
// type switch
// [style]
// palette switch
// [data plot]
// x
// x plot
// y
// y plot
// y group
// [axis]
// x axis off
// y axis off
// [area / line]
// smooth curve
// area gradient
// [cartesian grid]
// grid x off
// grid y off

type DataChartRendererType = "bar" | "bar-vertical" | "area" | "pie";

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

const data = [
  { month: "January", a: 186, b: 80, c: 100 },
  { month: "February", a: 305, b: 200, c: 150 },
  { month: "March", a: 237, b: 120, c: 200 },
  { month: "April", a: 73, b: 190, c: 250 },
  { month: "May", a: 209, b: 130, c: 300 },
  { month: "June", a: 214, b: 140, c: 350 },
];

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
      <div className="flex justify-between gap-4 h-full w-full">
        <div className="flex-1 mx-auto w-full h-full max-w-xl flex items-center justify-center">
          <div className="w-full aspect-video">
            <DataChart
              type={renderer}
              data={data}
              defs={{
                a: {
                  label: "A",
                  color: CHART_PALETTES[palette].colors[1],
                },
                b: {
                  label: "B",
                  color: CHART_PALETTES[palette].colors[2],
                },
                c: {
                  label: "C",
                  color: CHART_PALETTES[palette].colors[3],
                },
              }}
            />
          </div>
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
      </ToggleGroupItem>
      <ToggleGroupItem value="bar-vertical">
        <ResourceTypeIcon type="chart-bar-vertical" className="w-4 h-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="area">
        <ResourceTypeIcon type="chart-line" className="w-4 h-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="pie">
        <ResourceTypeIcon type="chart-pie" className="w-4 h-4" />
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
      onValueChange={(p) => {
        if (!p) return;
        onValueChange?.(p as DataChartPalette);
      }}
      className="flex-col items-start"
    >
      {STANDARD_PALETTES.map((key) => {
        const { label, colors } = CHART_PALETTES[key];
        return (
          <ToggleGroupItem
            key={key}
            value={key as DataChartPalette}
            className="flex w-full justify-between"
          >
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
        );
      })}
    </ToggleGroup>
  );
}

type DataGroupDef = {
  [key: string]: {
    label: string;
    color: string;
  };
};

function DataChart({
  type,
  defs,
  data,
}: {
  type: DataChartRendererType;
  data: Array<any>;
  defs: DataGroupDef;
}) {
  return (
    <>
      {type === "bar" && (
        <ChartContainer config={defs}>
          <BarChart accessibilityLayer data={data}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="month"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
            />
            <YAxis type="number" />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="dashed" />}
            />
            {Object.entries(defs).map(([key]) => {
              return (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={`var(--color-${key})`}
                  radius={4}
                />
              );
            })}
          </BarChart>
        </ChartContainer>
      )}
      {type === "bar-vertical" && (
        <ChartContainer config={defs}>
          <BarChart layout="vertical" data={data}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" />
            <YAxis type="category" dataKey="month" />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            {Object.entries(defs).map(([key]) => (
              <Bar key={key} dataKey={key} fill={`var(--color-${key})`} />
            ))}
          </BarChart>
        </ChartContainer>
      )}
      {type === "area" && (
        <ChartContainer config={defs}>
          <AreaChart
            accessibilityLayer
            data={data}
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
            />
            <YAxis type="number" />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <defs>
              {Object.entries(defs).map(([key]) => {
                return (
                  <linearGradient
                    id={`fill-${key}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor={`var(--color-${key})`}
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor={`var(--color-${key})`}
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                );
              })}
            </defs>
            {Object.entries(defs).map(([key]) => {
              return (
                <Area
                  key={key}
                  dataKey={key}
                  type="natural"
                  fill={`url(#fill-${key})`}
                  fillOpacity={0.4}
                  stroke={`var(--color-${key})`}
                  stackId={key}
                />
              );
            })}
          </AreaChart>
        </ChartContainer>
      )}
      {type === "pie" && (
        <ChartContainer
          config={defs}
          className="mx-auto aspect-square max-h-[250px]"
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Pie
              label
              data={transformdata_pie(data, {
                defs,
              })}
              dataKey={"value"}
              innerRadius={60}
            >
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        <tspan
                          x={viewBox.cx}
                          y={viewBox.cy}
                          className="fill-foreground text-3xl font-bold"
                        >
                          NUMBER
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 24}
                          className="fill-muted-foreground"
                        >
                          Attribute
                        </tspan>
                      </text>
                    );
                  }
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>
      )}
    </>
  );
}

// const defs = {
//   a: {
//     label: "A",
//     color: CHART_PALETTES[palette].colors[1],
//   },
//   b: {
//     label: "B",
//     color: CHART_PALETTES[palette].colors[2],
//   },
//   c: {
//     label: "C",
//     color: CHART_PALETTES[palette].colors[3],
//   },
// };

// const origindata = [
//   { month: "January", a: 186, b: 80, c: 100 },
//   { month: "February", a: 305, b: 200, c: 150 },
//   { month: "March", a: 237, b: 120, c: 200 },
//   { month: "April", a: 73, b: 190, c: 250 },
//   { month: "May", a: 209, b: 130, c: 300 },
//   { month: "June", a: 214, b: 140, c: 350 },
// ];

// const pieData_by_type = [
//   { group: "a", value: 275, fill: "#e76e50" },
//   { group: "b", value: 200, fill: "#e76e50" },
//   { group: "c", value: 287, fill: "#e76e50" },
// ];

// const pieData_by_month = [
//   { group: "January", value: 275, fill: "#e76e50" },
//   { group: "February", value: 200, fill: "#e76e50" },
//   { group: "March", value: 287, fill: "#e76e50" },
//   { group: "April", value: 275, fill: "#e76e50" },
//   { group: "May", value: 200, fill: "#e76e50" },
//   { group: "June", value: 287, fill: "#e76e50" },
// ];

function transformdata_pie<T = any>(
  data: Array<T>,
  {
    defs,
  }: {
    defs: DataGroupDef;
  }
): Array<{
  group: string;
  value: number;
  fill: string;
}> {
  const groups = Object.keys(defs);

  return groups.map((group) => {
    const totalValue = data.reduce((acc, item) => {
      // @ts-ignore
      return acc + item[group];
    }, 0);

    return {
      group: defs[group].label, // Use label from defs
      value: totalValue,
      fill: defs[group].color, // Use color from defs
    };
  });
}
