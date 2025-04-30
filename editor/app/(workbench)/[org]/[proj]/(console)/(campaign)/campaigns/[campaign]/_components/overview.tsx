"use client";

import { useState, useEffect, useMemo } from "react";
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Analytics } from "@/lib/analytics";
import useSWR from "swr";
import { useCampaign } from "../store";

interface DateRange {
  from: Date;
  to: Date | undefined;
}

interface AnalyzedData {
  interval: string;
  events: {
    bucket: string;
    name: string;
    count: number;
  }[];
}

export default function Overview() {
  const campaign = useCampaign();
  const [range, setRange] = useState<DateRange>({
    // start of the day
    from: new Date(new Date().setHours(0, 0, 0, 0)),
    to: undefined,
  });

  const [interval, setInterval] = useState<string>("15 minutes");

  const qs = useMemo(() => {
    return new URLSearchParams({
      from: range.from?.toISOString() || "",
      to: range.to?.toISOString() || "",
      interval,
    }).toString();
  }, [range, interval]);

  const { data } = useSWR<{ data: AnalyzedData }>(
    `/private/west/campaigns/${campaign.id}/events/analyze?${qs}`,
    async (url) => {
      const res = await fetch(url);
      return res.json();
    },
    {
      refreshInterval: 1000 * 30,
    }
  );

  return (
    <>
      <div className="flex items-center gap-2 w-min">
        <DateRangePicker
          onUpdate={({ range }) => {
            setRange(range);
            //
          }}
          align="start"
        />
        <Select value={interval} onValueChange={(value) => setInterval(value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="15 minutes">15 minutes</SelectItem>
            <SelectItem value="1 hour">1 hour</SelectItem>
            <SelectItem value="1 day">1 day</SelectItem>
            <SelectItem value="1 week">1 week</SelectItem>
            <SelectItem value="1 month">1 month</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="h-6" />
      {data ? <MainChart data={data.data} /> : null}
    </>
  );
}

function MainChart({ data }: { data: AnalyzedData }) {
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    processData(data);
  }, [data]);

  const processData = (data: AnalyzedData) => {
    if (!data.events.length) return;

    const grouped = Analytics.serialize(data.events, {
      dateKey: "bucket",
      interval: data.interval,
    });

    // Get all unique event names
    const eventNames = Array.from(new Set(data.events.map((e) => e.name)));

    const buckets = grouped.reduce(
      (acc, cur) => {
        const key = cur.date.toISOString();
        acc[key] = {
          ...cur,
          date: cur.date,
          bucket: Analytics.formatDateByInterval(cur.date, data.interval),
        };

        // Initialize all event names to 0
        eventNames.forEach((name) => {
          acc[key][name] = 0;
        });

        return acc;
      },
      {} as Record<string, any>
    );

    data.events.forEach((event) => {
      const iso = new Date(event.bucket).toISOString();
      if (!buckets[iso]) return;
      buckets[iso][event.name] += event.count;
    });

    const chartData = Object.values(buckets).sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );
    setChartData(chartData);
  };

  // Generate chart config with dynamic event names and colors
  const generateChartConfig = () => {
    if (!data?.events?.length) return {};

    const eventNames = Array.from(
      new Set(data.events.map((event) => event.name))
    );
    const colors = [
      "hsl(var(--chart-1))",
      "hsl(var(--chart-2))",
      "hsl(var(--chart-3))",
      "hsl(var(--chart-4))",
    ];

    const config: Record<string, any> = {};

    eventNames.forEach((name, index) => {
      config[name] = {
        label: name,
        color: colors[index % colors.length],
      };
    });

    return config;
  };

  // Get total counts for each event type
  const getEventTotals = () => {
    if (!data.events.length) return [];

    const eventNames = Array.from(
      new Set(data.events.map((event) => event.name))
    );
    const totals = eventNames.map((name) => {
      const total = data.events
        .filter((event) => event.name === name)
        .reduce((sum, event) => sum + event.count, 0);

      return { name, total };
    });

    return totals;
  };

  const eventTotals = getEventTotals();
  const chartConfig = generateChartConfig();
  const eventNames = Object.keys(chartConfig);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {eventTotals.map((event, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {event.name}
              </CardTitle>
              <div
                className="h-4 w-4 rounded-full"
                style={{ backgroundColor: chartConfig[event.name]?.color }}
              />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{event.total}</div>
              <p className="text-xs text-muted-foreground">
                {data.interval} intervals
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Event Activity</CardTitle>
          <CardDescription>
            Event counts over time (interval: {data.interval})
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[400px]">
            <ChartContainer config={chartConfig} className="h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 20, right: 20, left: 10, bottom: 20 }}
                >
                  <XAxis
                    dataKey="bucket"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={10}
                  />
                  <YAxis tickLine={false} axisLine={false} tickMargin={10} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  {eventNames.map((name, index) => (
                    <Line
                      key={index}
                      type="linear"
                      dataKey={name}
                      stroke={`var(--color-${name})`}
                      strokeWidth={2}
                      activeDot={{ r: 6, strokeWidth: 2 }}
                      dot={false}
                    />
                  ))}
                  <ChartLegend content={<ChartLegendContent />} />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
