"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  createClientFormsClient,
  createClientWorkspaceClient,
} from "@/lib/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import LineChart from "../charts/basic-line-chart";
import { GraphSkeleton, LabelSkeleton } from "../charts/skeleton";
import { SupabaseClient } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Database } from "@/types/supabase";
import {
  Select,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

interface LineChartData {
  date: Date;
  count: number;
}

async function fetchCustomers(
  q: {
    project_id: number;
    from: Date;
    to: Date;
  },
  {
    supabase,
  }: {
    supabase: SupabaseClient;
  }
) {
  return await supabase
    .from("customer")
    .select("created_at")
    .eq("project_id", q.project_id)
    .gte("created_at", q.from.toISOString())
    .lte("created_at", q.to.toISOString())
    .order("created_at", { ascending: true });
}

async function fetchResponses(
  q: {
    project_id: number;
    from: Date;
    to: Date;
  },
  {
    supabase,
  }: {
    supabase: SupabaseClient<Database, "grida_forms">;
  }
) {
  return await supabase
    .from("response")
    .select("created_at, form:form_id( project_id )")
    .eq("form.project_id", q.project_id)
    .gte("created_at", q.from.toISOString())
    .lte("created_at", q.to.toISOString())
    .order("created_at", { ascending: true });
}

export function ProjectStats({ project_id }: { project_id: number }) {
  const { range, setRange, from, to } = useDateRange();
  return (
    <div>
      <h1 className="text-2xl font-semibold">Your Overview</h1>
      <div>
        <RangeSelect
          value={range}
          onValueChange={(value) => setRange(value as RangeKey)}
        />
      </div>
      <div className="grid grid-cols-2 gap-4 mt-4">
        <Customers project_id={project_id} from={from} to={to} />
        <Responses project_id={project_id} from={from} to={to} />
      </div>
    </div>
  );
}

const rangeOptions = [
  { value: "7d", label: "Last 7 days" },
  { value: "4w", label: "Last 4 weeks" },
  { value: "1m", label: "Last 3 months" },
  { value: "12m", label: "Last 12 months" },
] as const;

type RangeKey = (typeof rangeOptions)[number]["value"];

function useDateRange() {
  const [range, setRange] = useState<RangeKey>("7d");

  const today = useMemo(() => new Date(), []);
  const from = useMemo(() => {
    const date = new Date(today);
    switch (range) {
      case "7d":
        return new Date(date.setDate(date.getDate() - 7));
      case "4w":
        return new Date(date.setDate(date.getDate() - 28));
      case "1m":
        return new Date(date.setMonth(date.getMonth() - 3));
      case "12m":
        return new Date(date.setFullYear(date.getFullYear() - 1));
    }
  }, [range, today]);

  const to = useMemo(() => today, [today]);

  return {
    range,
    setRange,
    from: from,
    to: to,
  };
}

function RangeSelect({
  value,
  onValueChange,
}: {
  onValueChange: (value: string) => void;
  value: string;
}) {
  return (
    <Select defaultValue="7d" value={value} onValueChange={onValueChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {rangeOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function serialize<T extends Record<string, any>>(
  data: Array<T>,
  {
    dateKey,
  }: {
    dateKey: keyof T;
  }
) {
  const newData = data.reduce(
    (acc: Record<string, number>, curr) => {
      const dateValue = curr[dateKey];

      if (typeof dateValue === "string" || (dateValue as any) instanceof Date) {
        const date = new Date(dateValue).toLocaleDateString();
        if (!acc[date]) acc[date] = 0;
        acc[date]++;
      }

      return acc;
    },
    {} as Record<string, number>
  );

  const formattedData = Object.entries(newData).map(([date, count]) => ({
    date: new Date(date),
    count,
  }));

  return formattedData;
}

function fmtnum(num: number) {
  return num.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1,");
}

export function Customers({
  from,
  to,
  project_id,
}: {
  project_id: number;
  from: Date;
  to: Date;
}) {
  const supabase = createClientWorkspaceClient();

  const [data, setData] = useState<LineChartData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      let { data, error } = await fetchCustomers(
        {
          project_id,
          from: from,
          to: to,
        },
        { supabase }
      );

      if (error) {
        console.error(error);
      } else {
        // Process data to count new customers per day
        setData(serialize(data || [], { dateKey: "created_at" }));
      }
      setLoading(false);
    };

    fetchData();
  }, [project_id, from, to]);

  return (
    <Card className="p-4">
      <CardHeader>
        <h1 className="text-lg font-semibold">New Customers</h1>
        {loading ? (
          <LabelSkeleton />
        ) : (
          <div className="flex items-center space-x-2">
            <span className="text-3xl font-bold">
              {fmtnum(data.reduce((sum, item) => sum + item.count, 0))}
            </span>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <GraphSkeleton />
        ) : (
          <LineChart
            data={data}
            // hoverComponent={CustomHoverComponent}
          />
        )}
      </CardContent>
    </Card>
  );
}

export function Responses({
  from,
  to,
  project_id,
}: {
  project_id: number;
  from: Date;
  to: Date;
}) {
  const supabase = createClientFormsClient();

  const [data, setData] = useState<LineChartData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      let { data, error } = await fetchResponses(
        {
          project_id,
          from: from,
          to: to,
        },
        { supabase }
      );

      if (error) {
        console.error(error);
      } else {
        // Process data to count new responses per day
        setData(serialize(data || [], { dateKey: "created_at" }));
      }
      setLoading(false);
    };

    fetchData();
  }, [project_id, from, to]);

  return (
    <Card className="p-4">
      <CardHeader>
        <h1 className="text-lg font-semibold">New Responses</h1>
        {loading ? (
          <LabelSkeleton />
        ) : (
          <div className="flex items-center space-x-2">
            <span className="text-3xl font-bold">
              {fmtnum(data.reduce((sum, item) => sum + item.count, 0))}
            </span>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <GraphSkeleton />
        ) : (
          <LineChart
            data={data}
            // hoverComponent={CustomHoverComponent}
          />
        )}
      </CardContent>
    </Card>
  );
}
