"use client";
import LiveWorldAnalytics from "@/scaffolds/analytics/world/live-world-analytics";

type Params = {
  org: string;
  proj: string;
};

export default function ProjectAnalyticsPage() {
  return <LiveWorldAnalytics eventStreams={[]} />;
}
