"use client";

import React from "react";
import { ParentSize } from "@visx/responsive";
import {
  XYChart,
  AnimatedAxis,
  AnimatedLineSeries,
  AnimatedBarSeries,
  Tooltip,
  DataProvider,
} from "@visx/xychart";
import { useDarkMode } from "usehooks-ts";

interface TimeSeriesChartData {
  date: Date;
  count: number;
}

interface TimeSeriesChartProps {
  data: TimeSeriesChartData[];
  chartType: "line" | "bar";
  height?: number;
  margin?: { top: number; right: number; bottom: number; left: number };
  datefmt?: (date: Date) => string;
}

const TimeSeriesChart: React.FC<TimeSeriesChartProps> = ({
  data,
  chartType,
  datefmt = (date) => date.toLocaleDateString(),
  margin = { top: 16, right: 16, bottom: 40, left: 40 },
}) => {
  const { isDarkMode } = useDarkMode();

  if (data.length === 0) return null;

  const accessors = {
    xAccessor: (d: TimeSeriesChartData) => d.date,
    yAccessor: (d: TimeSeriesChartData) => d.count,
  };

  return (
    <ParentSize>
      {({ width, height }) => (
        <DataProvider xScale={{ type: "time" }} yScale={{ type: "linear" }}>
          <XYChart height={height} width={width} margin={margin}>
            {chartType === "line" ? (
              <AnimatedLineSeries
                dataKey="LineChart"
                data={data}
                {...accessors}
                strokeWidth={2.5}
                className="stroke-primary"
              />
            ) : (
              <AnimatedBarSeries
                dataKey="BarChart"
                colorAccessor={() => (isDarkMode ? "white" : "black")}
                data={data}
                {...accessors}
              />
            )}
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
              zIndex={10}
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
                      {datefmt(
                        accessors.xAccessor(
                          tooltipData?.nearestDatum?.datum as any
                        )
                      )}
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

export default TimeSeriesChart;
