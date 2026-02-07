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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Activity, Loader2 } from "lucide-react";

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

interface EventTotal {
  name: string;
  total: number;
}

function generateChartConfig(data: AnalyzedData) {
  if (!data.events.length) return {};

  const eventNames = Array.from(
    new Set(data.events.map((event) => event.name))
  );
  const colors = [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
  ];

  const config: Record<string, any> = {};

  eventNames.forEach((name, index) => {
    config[name] = {
      label: name,
      color: colors[index % colors.length],
    };
  });

  return config;
}

function getEventTotals(data: AnalyzedData): EventTotal[] {
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
}

function EmptyState() {
  return (
    <Empty className="w-full h-full">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Activity />
        </EmptyMedia>
        <EmptyTitle>No activity yet</EmptyTitle>
        <EmptyDescription>
          Your campaign is ready to go! Once participants start engaging with
          your campaign, you&apos;ll see activity data here.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <Loader2 className="size-8 animate-spin text-muted-foreground mb-4" />
      <p className="text-sm text-muted-foreground">Loading activity data...</p>
    </div>
  );
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

  const { data, isLoading } = useSWR<{ data: AnalyzedData }>(
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
      {data?.data?.events?.length ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {getEventTotals(data.data).map((event: EventTotal, i: number) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {event.name}
                </CardTitle>
                <div
                  className="size-4 rounded-full"
                  style={{
                    backgroundColor: generateChartConfig(data.data)[event.name]
                      ?.color,
                  }}
                />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{event.total}</div>
                <p className="text-xs text-muted-foreground">
                  {data.data.interval} intervals
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
      <div className="h-6" />
      <Card>
        <CardHeader>
          <CardTitle>Event Activity</CardTitle>
          <CardDescription>
            {data?.data?.events?.length
              ? `Event counts over time (interval: ${data.data.interval})`
              : "Monitor your campaign's performance"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[400px]">
            {isLoading ? (
              <LoadingState />
            ) : data?.data?.events?.length ? (
              <MainChart data={data.data} />
            ) : (
              <EmptyState />
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function MainChart({ data }: { data: AnalyzedData }) {
  const [chartData, setChartData] = useState<any[]>([]);

  function processData(data: AnalyzedData) {
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
  }

  useEffect(() => {
    processData(data);
  }, [data]);

  return (
    <ChartContainer
      config={generateChartConfig(data)}
      className="h-full w-full"
    >
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
          {Object.keys(generateChartConfig(data)).map((name, index) => (
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
  );
}
