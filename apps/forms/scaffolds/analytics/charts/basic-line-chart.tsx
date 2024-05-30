import React from "react";
import { LinePath } from "@visx/shape";
import { scaleTime, scaleLinear } from "@visx/scale";
import { Group } from "@visx/group";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { curveLinear } from "d3-shape";

interface LineChartData {
  date: Date;
  count: number;
}

interface LineChartProps {
  data: LineChartData[];
  width?: number;
  height?: number;
  margin?: { top: number; right: number; bottom: number; left: number };
  hoverComponent?: React.FC<{ data: LineChartData }>;
}

const LineChart: React.FC<LineChartProps> = ({
  data,
  width = 400,
  height = 200,
  margin = { top: 8, right: 8, bottom: 8, left: 20 },
  hoverComponent: HoverComponent,
}) => {
  if (data.length === 0) return null;

  const xExtent = [
    Math.min(...data.map((d) => d.date.getTime())),
    Math.max(...data.map((d) => d.date.getTime())),
  ];

  const yMax = Math.max(...data.map((d) => d.count));

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
          stroke="black"
          strokeWidth={2}
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
          tickLabelProps={() => ({
            fill: "black",
            fontSize: 12,
            textAnchor: "middle",
          })}
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
            fill: "black",
            fontSize: 12,
            textAnchor: "middle",
          })}
          hideTicks
        />
        {HoverComponent &&
          data.map((d, index) => <HoverComponent key={index} data={d} />)}
      </Group>
    </svg>
  );
};

export default LineChart;
