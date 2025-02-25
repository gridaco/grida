"use client";

import React from "react";
import { CartesianGrid, XAxis, Area, AreaChart } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { CurveType } from "recharts/types/shape/Curve";

interface TimeSeriesChartData {
  date: Date;
  count: number;
}

interface TimeSeriesChartProps {
  data: TimeSeriesChartData[];
  type?: CurveType;
  margin?: { top: number; right: number; bottom: number; left: number };
  datefmt?: (date: Date) => string;
}

const chartConfig = {
  data: {
    label: "Count",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

const TimeSeriesChart: React.FC<TimeSeriesChartProps> = ({
  data,
  type: curveType = "step",
  datefmt = (date) =>
    date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
  margin = { top: 12, right: 12, bottom: 0, left: 12 },
}) => {
  if (data.length === 0) return <></>;

  return (
    <ChartContainer config={chartConfig}>
      <AreaChart accessibilityLayer data={data} margin={margin}>
        <CartesianGrid vertical={false} horizontal={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          tickMargin={8}
          minTickGap={24}
          tickFormatter={datefmt}
        />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <defs>
          <linearGradient id="data" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-data)" stopOpacity={0.8} />
            <stop
              offset="95%"
              stopColor="var(--color-data)"
              stopOpacity={0.1}
            />
          </linearGradient>
        </defs>
        <Area
          dataKey="count"
          type={curveType}
          fill="url(#data)"
          fillOpacity={0.4}
          stroke="var(--color-data)"
          stackId="a"
        />
      </AreaChart>
    </ChartContainer>
  );
};

export default TimeSeriesChart;
