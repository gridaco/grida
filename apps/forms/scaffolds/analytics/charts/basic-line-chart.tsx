"use client";

import React from "react";
import { LinePath } from "@visx/shape";
import { scaleTime, scaleLinear } from "@visx/scale";
import { Group } from "@visx/group";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { curveLinear } from "d3-shape";
import { ParentSize } from "@visx/responsive";

interface LineChartData {
  date: Date;
  count: number;
}

interface LineChartProps {
  data: LineChartData[];
  height?: number;
  margin?: { top: number; right: number; bottom: number; left: number };
  hoverComponent?: React.FC<{ data: LineChartData }>;
}

const LineChart: React.FC<LineChartProps> = ({
  data,
  margin = { top: 16, right: 16, bottom: 40, left: 40 },
  hoverComponent: HoverComponent,
}) => {
  if (data.length === 0) return null;

  const xExtent = [
    Math.min(...data.map((d) => d.date.getTime())),
    Math.max(...data.map((d) => d.date.getTime())),
  ];

  const yMax = Math.max(...data.map((d) => d.count));

  return (
    <ParentSize>
      {({ width, height }) => {
        const xScale = scaleTime({
          domain: xExtent,
          range: [margin.left, width - margin.right],
        });

        const yScale = scaleLinear({
          domain: [0, yMax],
          range: [height - margin.bottom, margin.top],
        });

        return (
          <svg width={width} height={height}>
            <Group>
              <LinePath
                data={data}
                x={(d) => xScale(d.date)}
                y={(d) => yScale(d.count)}
                className="stroke-primary"
                strokeWidth={2.5}
                curve={curveLinear}
              />
              <AxisBottom
                top={height - margin.bottom}
                scale={xScale}
                tickFormat={(value, index, ticks) =>
                  index === 0 || index === ticks.length - 1
                    ? new Date(value as any).toLocaleDateString()
                    : ""
                }
                numTicks={data.length}
                tickStroke="none"
                tickLabelProps={(value, index, ticks) => ({
                  className: "fill-muted-foreground",
                  fontSize: 12,
                  textAnchor:
                    index === 0
                      ? "start"
                      : index === ticks.length - 1
                        ? "end"
                        : "middle",
                })}
                axisLineClassName="stroke-muted-foreground opacity-20"
                hideTicks
              />
              <AxisLeft
                left={margin.left}
                scale={yScale}
                numTicks={5}
                // @ts-ignore
                tickFormat={(value, index, ticks) =>
                  index === 0 || index === ticks.length - 1 ? value : ""
                }
                tickStroke="none"
                tickLabelProps={() => ({
                  className: "fill-muted-foreground",
                  fontSize: 12,
                  textAnchor: "end",
                })}
                hideAxisLine
                hideTicks
              />
              {HoverComponent &&
                data.map((d, index) => <HoverComponent key={index} data={d} />)}
            </Group>
          </svg>
        );
      }}
    </ParentSize>
  );
};

export default LineChart;
