"use client";

import React from "react";
import { ParentSize } from "@visx/responsive";
import {
  XYChart,
  AnimatedAxis,
  AnimatedLineSeries,
  Tooltip,
  DataProvider,
} from "@visx/xychart";

interface LineChartData {
  date: Date;
  count: number;
}

interface LineChartProps {
  data: LineChartData[];
  height?: number;
  margin?: { top: number; right: number; bottom: number; left: number };
}

const LineChart: React.FC<LineChartProps> = ({
  data,
  margin = { top: 16, right: 16, bottom: 40, left: 40 },
}) => {
  if (data.length === 0) return null;

  const accessors = {
    xAccessor: (d: LineChartData) => d.date,
    yAccessor: (d: LineChartData) => d.count,
  };

  return (
    <ParentSize>
      {({ width, height }) => (
        <DataProvider xScale={{ type: "time" }} yScale={{ type: "linear" }}>
          <XYChart height={height} width={width} margin={margin}>
            <AnimatedLineSeries
              dataKey="LineChart"
              data={data}
              {...accessors}
              strokeWidth={2.5}
              className="stroke-primary"
            />
            <AnimatedAxis
              orientation="bottom"
              hideTicks
              axisLineClassName="stroke-muted-foreground opacity-50"
              tickLabelProps={(value, index, ticks) => ({
                className: "fill-muted-foreground",
                textAnchor:
                  index === 0
                    ? "start"
                    : index === ticks.length - 1
                      ? "end"
                      : "middle",
                display:
                  index === 0 || index === ticks.length - 1 ? "block" : "none",
              })}
            />
            <AnimatedAxis
              orientation="left"
              hideTicks
              hideAxisLine
              tickLabelProps={(value, index, ticks) => ({
                className: "fill-muted-foreground",
                fontSize: 12,
                textAnchor: "end",
                display:
                  index === 0 || index === ticks.length - 1 ? "block" : "none",
              })}
            />
            <Tooltip
              showVerticalCrosshair
              verticalCrosshairStyle={{
                strokeDasharray: "2 2",
              }}
              showDatumGlyph
              snapTooltipToDatumX
              snapTooltipToDatumY
              renderGlyph={() => (
                <circle
                  r={4}
                  className="fill-accent-foreground stroke-accent"
                  strokeWidth={1}
                />
              )}
              renderTooltip={({ tooltipData }) => (
                <div>
                  <span>
                    <small>
                      {accessors
                        .xAccessor(tooltipData?.nearestDatum?.datum as any)
                        .toLocaleDateString()}
                    </small>{" "}
                    <strong>
                      {accessors.yAccessor(
                        tooltipData?.nearestDatum?.datum as any
                      )}
                    </strong>
                  </span>
                </div>
              )}
            />
          </XYChart>
        </DataProvider>
      )}
    </ParentSize>
  );
};

export default LineChart;
