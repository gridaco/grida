"use client";

import { useState, useEffect, useMemo } from "react";
import { format, parseISO } from "date-fns";
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

import { useProject } from "@/scaffolds/workspace";
import useSWR from "swr";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TokensTable } from "./tokens-table";
import LogsTable from "./logs-table";
import { ParticipantsTable } from "./participants-table";
import { QuestsTable } from "./quests-table";
import CampaignSettings from "./settings";

type Params = {
  org: string;
  proj: string;
  series: string;
};

interface DateRange {
  from: Date;
  to: Date | undefined;
}

export default function CampaignsPage({ params }: { params: Params }) {
  const { series: series_id } = params;
  const { id: project_id } = useProject();

  const [range, setRange] = useState<DateRange>({
    from: new Date(),
    to: undefined,
  });

  const [interval, setInterval] = useState<string>("1 minute");

  const qs = useMemo(() => {
    return new URLSearchParams({
      from: range.from?.toISOString() || "",
      to: range.to?.toISOString() || "",
      interval,
    }).toString();
  }, [range, interval]);

  const { data } = useSWR(
    `/private/tokens/${project_id}/series/${series_id}/events/analyze?${qs}`,
    async (url) => {
      const res = await fetch(url);
      return res.json();
    },
    {
      refreshInterval: 1000 * 30,
    }
  );

  return (
    <main className="container mx-auto my-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Campaign <span className="font-mono text-sm">{series_id}</span>
          </h1>
          <p className="text-muted-foreground">
            Track your marketing campaign performance in real-time
          </p>
        </div>
      </div>
      <Tabs defaultValue="overview" className="mt-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="participants">Participants</TabsTrigger>
          <TabsTrigger value="quests">Quests</TabsTrigger>
          <TabsTrigger value="tokens">Tokens</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <hr className="mt-2 mb-6" />
        <TabsContent value="overview">
          <div className="flex items-center gap-2 w-min">
            <DateRangePicker
              onUpdate={({ range }) => {
                setRange(range);
                //
              }}
              align="end"
            />
            <Select
              value={interval}
              onValueChange={(value) => setInterval(value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1 minute">1 minute</SelectItem>
                <SelectItem value="1 hour">1 hour</SelectItem>
                <SelectItem value="1 day">1 day</SelectItem>
                <SelectItem value="1 week">1 week</SelectItem>
                <SelectItem value="1 month">1 month</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="h-6" />
          {data ? <Chart data={data.data} /> : null}
        </TabsContent>
        <TabsContent value="participants">
          <ParticipantsTable series_id={series_id} />
        </TabsContent>
        <TabsContent value="quests">
          <QuestsTable series_id={series_id} />
        </TabsContent>
        <TabsContent value="tokens">
          <TokensTable series_id={series_id} />
        </TabsContent>
        <TabsContent value="logs">
          <LogsTable series_id={series_id} />
        </TabsContent>
        <TabsContent value="settings">
          <CampaignSettings series_id={series_id} />
        </TabsContent>
      </Tabs>
    </main>
  );
}

interface AnalyzedData {
  interval: string;
  events: {
    bucket: string;
    name: string;
    count: number;
  }[];
}

function Chart({ data }: { data: AnalyzedData }) {
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    processData(data);
  }, [data]);

  // Process the data for the chart
  const processData = (data: AnalyzedData) => {
    if (!data.events.length) return;

    // Group by bucket and create chart data
    const bucketMap = new Map();

    data.events.forEach((event) => {
      const date = parseISO(event.bucket);
      const formattedDate = format(date, "HH:mm:ss");

      if (!bucketMap.has(formattedDate)) {
        bucketMap.set(formattedDate, {
          bucket: formattedDate,
          date: date, // Keep the original date for sorting
        });
      }

      const bucketData = bucketMap.get(formattedDate);
      bucketData[event.name] = event.count;
    });

    // Convert map to array and sort by date
    const processed = Array.from(bucketMap.values())
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((item) => {
        const { date, ...rest } = item;
        return rest;
      });

    setChartData(processed);
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
        label: name.charAt(0).toUpperCase() + name.slice(1),
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
