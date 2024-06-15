"use client";

import type { Database } from "@/database.types";
import React, { useEffect, useMemo, useState } from "react";
import {
  createClientFormsClient,
  createClientWorkspaceClient,
} from "@/lib/supabase/client";
import TimeSeriesChart from "../charts/timeseries";
import { GraphSkeleton, NumberSkeleton } from "../charts/skeleton";
import { SupabaseClient } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Select,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { serialize } from "../charts/serialize";

const DAY_MS = 24 * 60 * 60 * 1000;

interface LineChartData {
  date: Date;
  count: number;
}

async function fetchSession(
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
    .from("response_session")
    .select("created_at, form:form_id!inner( project_id )")
    .eq("form.project_id", q.project_id)
    .gte("created_at", q.from.toISOString())
    .lte("created_at", q.to.toISOString())
    .order("created_at", { ascending: true });
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
    .select("created_at, form:form_id!inner( project_id )")
    .eq("form.project_id", q.project_id)
    .gte("created_at", q.from.toISOString())
    .lte("created_at", q.to.toISOString())
    .order("created_at", { ascending: true });
}

export function ProjectStats({ project_id }: { project_id: number }) {
  const { range, setRange, from, to } = useDateRange();
  return (
    <div>
      <header>
        <div className="mt-4 w-min">
          <RangeSelect
            value={range}
            onValueChange={(value) => setRange(value as RangeKey)}
          />
        </div>
      </header>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
        <Customers project_id={project_id} from={from} to={to} />
        <Responses project_id={project_id} from={from} to={to} />
        <Sessions project_id={project_id} from={from} to={to} />
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

export function fmtnum(num: number) {
  return num.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1,");
}

export function Sessions({
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
      let { data, error } = await fetchSession(
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
        setData(
          serialize(data || [], {
            from,
            to,
            dateKey: "created_at",
            intervalMs: DAY_MS,
          })
        );
      }
      setLoading(false);
    };

    fetchData();
  }, [project_id, from, to]);

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <h1 className="text-lg font-semibold">Sessions</h1>
        {loading ? (
          <NumberSkeleton />
        ) : (
          <div className="flex items-center space-x-2">
            <span className="text-3xl font-bold">
              {fmtnum(data.reduce((sum, item) => sum + item.count, 0))}
            </span>
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0 h-40 w-full">
        {loading ? (
          <div className="p-6">
            <GraphSkeleton />
          </div>
        ) : (
          <TimeSeriesChart data={data} chartType="line" />
        )}
      </CardContent>
    </Card>
  );
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
        setData(
          serialize(data || [], {
            from,
            to,
            dateKey: "created_at",
            intervalMs: DAY_MS,
          })
        );
      }
      setLoading(false);
    };

    fetchData();
  }, [project_id, from, to]);

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <h1 className="text-lg font-semibold">New Customers</h1>
        {loading ? (
          <NumberSkeleton />
        ) : (
          <div className="flex items-center space-x-2">
            <span className="text-3xl font-bold">
              {fmtnum(data.reduce((sum, item) => sum + item.count, 0))}
            </span>
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0 h-40 w-full">
        {loading ? (
          <div className="p-6">
            <GraphSkeleton />
          </div>
        ) : (
          <TimeSeriesChart data={data} chartType="line" />
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
        setData(
          serialize(data || [], {
            from,
            to,
            dateKey: "created_at",
            intervalMs: DAY_MS,
          })
        );
      }
      setLoading(false);
    };

    fetchData();
  }, [project_id, from, to]);

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <h1 className="text-lg font-semibold">New Responses</h1>
        {loading ? (
          <NumberSkeleton />
        ) : (
          <div className="flex items-center space-x-2">
            <span className="text-3xl font-bold">
              {fmtnum(data.reduce((sum, item) => sum + item.count, 0))}
            </span>
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0 h-40 w-full">
        {loading ? (
          <div className="p-6">
            <GraphSkeleton />
          </div>
        ) : (
          <TimeSeriesChart data={data} chartType="line" />
        )}
      </CardContent>
    </Card>
  );
}
