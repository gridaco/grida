"use client";

import { useCallback, useMemo, useReducer, useState } from "react";
import { TrendingUp } from "lucide-react";
import {
  Label as ChartLabel,
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
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import produce from "immer";
import { ResourceTypeIcon } from "@/components/resource-type-icon";
import { CHART_PALETTES, DataChartPalette, STANDARD_PALETTES } from "./colors";
import { useDatagridTable, useDatagridTableSpace } from "../editor";
import assert from "assert";
import { GridaXSupabase } from "@/types";
import type { FormInputType } from "@/grida-forms-hosted/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormFieldTypeIcon } from "@/components/form-field-type-icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Chart } from "@/lib/chart";
import { ChartPartialDataAlert, useChartDataStat } from "./warn-partial-data";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

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

type DataChartCurveType = "bump" | "linear" | "natural" | "step";

type DataChartAreaFillType = "solid" | "gradient" | "transparent";

type DataChartCartesianGridState = {
  // rename to main and cross ?
  vertical: boolean;
  horizontal: boolean;
};

interface CrossAxisDataQuery {
  fn: "count";
}

interface ChartViewState {
  renderer: DataChartRendererType;
  palette: DataChartPalette;
  curve: DataChartCurveType;
  areaFill: DataChartAreaFillType;
  grid: DataChartCartesianGridState;
  mainAxis: Chart.MainAxisDataQuery;
  crossAxis: CrossAxisDataQuery;
  semantic: "continuous" | "discrete" | "unknwon";
}

type ChartViewAction =
  | { type: "type"; renderer: DataChartRendererType }
  | { type: "palette"; palette: DataChartPalette }
  | { type: "curve"; curve: DataChartCurveType }
  | { type: "area-fill"; areaFill: DataChartAreaFillType }
  | { type: "main-axis"; query: Chart.MainAxisDataQuery };

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
    case "curve": {
      const { curve } = action;
      return produce(state, (draft) => {
        draft.curve = curve;
      });
    }
    case "area-fill": {
      const { areaFill } = action;
      return produce(state, (draft) => {
        draft.areaFill = areaFill;
      });
    }
    case "main-axis": {
      const { query } = action;
      return produce(state, (draft) => {
        draft.mainAxis = query;
      });
    }
  }

  return state;
}

const dummy_pretty_data = [
  { month: "January", a: 214, b: 80, c: 100 },
  { month: "February", a: 305, b: 200, c: 150 },
  { month: "March", a: 237, b: 120, c: 200 },
  { month: "April", a: 73, b: 190, c: 250 },
  { month: "May", a: 209, b: 130, c: 300 },
  { month: "June", a: 214, b: 140, c: 350 },
];

function useDataFrame() {
  const tb = useDatagridTable();
  const space = useDatagridTableSpace()!;
  assert(tb?.provider === "x-supabase", "other than xsb is not supported yet");
  assert(typeof tb.id === "string");

  const attributes = tb.attributes;
  const data: Array<GridaXSupabase.XDataRow> =
    space.stream as Array<GridaXSupabase.XDataRow>;

  // attributes[0].type;
  // attributes[0].name;
  // //

  // const cell = data[0]["key"];

  return {
    attributes: attributes,
    data: data,
  };
  //
}

export function DataChartview() {
  const df = useDataFrame();

  const [state, dispatch] = useReducer(reducer, {
    renderer: "bar",
    palette: "slate",
    curve: "natural",
    areaFill: "gradient",
    grid: {
      vertical: true,
      horizontal: false,
    },
    mainAxis: { key: "", sort: "none", aggregate: "datetime-week" },
    crossAxis: { fn: "count" },
    semantic: "unknwon",
  });

  const { mainAxis, renderer, curve, areaFill, palette } = state;

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

  const changeCurve = useCallback(
    (curve: DataChartCurveType) => {
      dispatch({ type: "curve", curve: curve });
    },
    [dispatch]
  );
  const changeAreaFill = useCallback(
    (areaFill: DataChartAreaFillType) => {
      dispatch({ type: "area-fill", areaFill: areaFill });
    },
    [dispatch]
  );

  const changeMainAxis = useCallback(
    (query: Chart.MainAxisDataQuery) => {
      dispatch({ type: "main-axis", query: query });
    },
    [dispatch]
  );

  const data = Chart.chart(df.data, mainAxis);
  console.log("data", data);

  const stat = useChartDataStat();

  return (
    <div className="w-full h-full p-4">
      <div className="w-full h-full flex justify-between gap-4">
        <div className="flex-1 relative w-full h-full">
          <Card className="w-full h-full flex items-center justify-center">
            <div className="w-full h-[400px]">
              {stat ? (
                <DataChart
                  type={renderer}
                  curve={curve}
                  data={data}
                  // data={df.data}
                  // data={dummy_pretty_data}
                  dataKey={"key"}
                  areaFill={areaFill}
                  defs={{
                    count: {
                      label: "Count",
                      color: CHART_PALETTES[palette].colors[1],
                    },
                    // b: {
                    //   label: "B",
                    //   color: CHART_PALETTES[palette].colors[2],
                    // },
                    // c: {
                    //   label: "C",
                    //   color: CHART_PALETTES[palette].colors[3],
                    // },
                  }}
                  className="h-full aspect-auto"
                />
              ) : (
                <DataChartSkeleton />
              )}
            </div>
          </Card>
          {stat?.is_data_not_fully_loaded && (
            <div className="absolute top-4 right-4 z-10">
              <ChartPartialDataAlert
                count={stat.count}
                estimated_count={stat.estimated_count}
              />
            </div>
          )}
        </div>
        <aside className="shrink-0 flex flex-col gap-4 w-60 max-w-xs pl-4 border-l">
          <ChartTypeToggleGroup value={renderer} onValueChange={changeType} />
          <hr />
          <Label className="text-muted-foreground">Main Axis</Label>
          <MainAxisQueryControl
            value={mainAxis}
            onValueChange={changeMainAxis}
            attributes={df.attributes}
          />
          <hr />
          <Label className="text-muted-foreground">Styles</Label>
          <CurveTypeControl value={curve} onValueChange={changeCurve} />
          <AreaFillTypeControl
            value={areaFill}
            onValueChange={changeAreaFill}
          />
          <PaletteToggleGroup value={palette} onValueChange={changePalette} />
        </aside>
      </div>
    </div>
  );
}

function CurveTypeControl({
  value,
  onValueChange,
}: {
  value: DataChartCurveType;
  onValueChange?: (value: DataChartCurveType) => void;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {["bump", "linear", "natural", "step"].map((curve) => (
          <SelectItem key={curve} value={curve}>
            {curve}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AreaFillTypeControl({
  value,
  onValueChange,
}: {
  value: DataChartAreaFillType;
  onValueChange?: (value: DataChartAreaFillType) => void;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {["gradient", "solid", "transparent"].map((curve) => (
          <SelectItem key={curve} value={curve}>
            {curve}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
        <ResourceTypeIcon type="chart-bar" className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="bar-vertical">
        <ResourceTypeIcon type="chart-bar-vertical" className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="area">
        <ResourceTypeIcon type="chart-line" className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="pie">
        <ResourceTypeIcon type="chart-pie" className="size-4" />
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
                  className="size-4 rounded-xs"
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

function MainAxisQueryControl({
  value,
  onValueChange,
  attributes,
}: {
  value: Chart.MainAxisDataQuery;
  onValueChange?: (value: Chart.MainAxisDataQuery) => void;
  attributes: { name: string; type: FormInputType }[];
}) {
  const onKeyChange = (key: string) => {
    onValueChange?.({ ...value, aggregate: "none", key });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          {value.key ? value.key : "What to show"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuRadioGroup onValueChange={onKeyChange}>
          {attributes.map(({ name, type }) => {
            const onAggregateChange = (aggregate: Chart.MainAxisAggregate) => {
              onValueChange?.({ ...value, key: name, aggregate });
            };

            switch (type) {
              case "date":
              case "datetime-local":
              case "month":
              case "week":
              case "time":
                return (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>{name}</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuRadioGroup
                        value={value.aggregate}
                        onValueChange={(v) =>
                          onAggregateChange(v as Chart.MainAxisAggregate)
                        }
                      >
                        <DropdownMenuRadioItem
                          value={"none" satisfies Chart.MainAxisAggregate}
                        >
                          None
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem
                          value={
                            "datetime-day" satisfies Chart.MainAxisAggregate
                          }
                        >
                          Day
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem
                          value={
                            "datetime-week" satisfies Chart.MainAxisAggregate
                          }
                        >
                          Week
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem
                          value={
                            "datetime-year" satisfies Chart.MainAxisAggregate
                          }
                        >
                          Year
                        </DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                );
            }
            return (
              <DropdownMenuRadioItem key={name} value={name}>
                <FormFieldTypeIcon
                  type={type}
                  className="inline-block me-2 align-middle size-4"
                />
                {name}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DataChartSkeleton({ count = 20 }: { count?: number }) {
  const randbars = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        return Math.floor(Math.random() * 100);
      }),
    [count]
  );
  return (
    <div className="aspect-video h-full mx-auto px-10">
      <div className="w-full h-full flex items-end justify-end gap-4">
        {randbars.map((height, i) => (
          <Skeleton
            key={i}
            className="w-full"
            style={{
              height: `${height}%`,
            }}
          />
        ))}
      </div>
    </div>
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
  dataKey,
  curve,
  areaFill,
  className,
}: {
  type: DataChartRendererType;
  data: Array<any>;
  dataKey: string;
  defs: DataGroupDef;
  curve?: DataChartCurveType;
  areaFill?: DataChartAreaFillType;
  className?: string;
}) {
  return (
    <>
      {type === "bar" && (
        <ChartContainer config={defs} className={className}>
          <BarChart accessibilityLayer data={data}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey={dataKey}
              tickLine={false}
              tickMargin={10}
              axisLine={false}
            />
            <YAxis type="number" tickLine={false} axisLine={false} />
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
        <ChartContainer config={defs} className={className}>
          <BarChart layout="vertical" data={data}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" tickLine={false} axisLine={false} />
            <YAxis
              type="category"
              dataKey={dataKey}
              tickLine={false}
              tickMargin={10}
              axisLine={false}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            {Object.entries(defs).map(([key]) => (
              <Bar key={key} dataKey={key} fill={`var(--color-${key})`} />
            ))}
          </BarChart>
        </ChartContainer>
      )}
      {type === "area" && (
        <ChartContainer config={defs} className={className}>
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
              dataKey={dataKey}
              tickLine={false}
              tickMargin={8}
              axisLine={false}
            />
            <YAxis type="number" tickLine={false} axisLine={false} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <defs>
              {Object.entries(defs).map(([key]) => {
                return (
                  <linearGradient
                    key={key}
                    id={`fill-${key}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor={`var(--color-${key})`}
                      stopOpacity={areaFill === "gradient" ? 0.8 : 1}
                    />
                    <stop
                      offset="95%"
                      stopColor={`var(--color-${key})`}
                      stopOpacity={areaFill === "gradient" ? 0.1 : 1}
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
                  type={curve}
                  fill={`url(#fill-${key})`}
                  fillOpacity={areaFill === "transparent" ? 0 : 0.4}
                  stroke={`var(--color-${key})`}
                  stackId={key}
                />
              );
            })}
          </AreaChart>
        </ChartContainer>
      )}
      {type === "pie" && (
        <ChartContainer config={defs} className={className}>
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
              <ChartLabel
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
