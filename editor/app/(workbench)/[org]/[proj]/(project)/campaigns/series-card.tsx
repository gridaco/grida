"use client";
import Link from "next/link";
import { Users, ArrowUpRight, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Platform } from "@/lib/platform";

export function SeriesCard({ data }: { data: Platform.WEST.TokenSeries }) {
  // This would normally be passed as props
  const campaign = {
    id: data.id,
    name: data.name,
    description: data.description ?? "(No description)",
    status: data.enabled ? "active" : "paused",
    startDate: "2023-06-01",
    endDate: "2023-08-31",
    referrals: 128,
    goal: 500,
    conversion: 24,
    reward: "$25 Gift Card",
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="p-4 pb-0 flex flex-row items-start justify-between space-y-0">
        <div>
          <Badge variant={"outline"}>
            {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
          </Badge>
          <CardTitle className="text-lg mt-2">{campaign.name}</CardTitle>
          <CardDescription className="line-clamp-1 mt-1">
            {campaign.description}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <div className="space-y-4">
          <div className="flex justify-between text-sm">
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span>{campaign.referrals} referrals</span>
            </div>
            <div className="flex items-center gap-1">
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
              <span>{campaign.conversion}% conversion</span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>Progress</span>
              <span>
                {Math.round((campaign.referrals / campaign.goal) * 100)}%
              </span>
            </div>
            <Progress
              value={(campaign.referrals / campaign.goal) * 100}
              className="h-2"
            />
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>
                Started {new Date(campaign.startDate).toLocaleDateString()}
              </span>
            </div>
            <div>Reward: {campaign.reward}</div>
          </div>
        </div>
      </CardContent>
      <CardFooter className="p-4 pt-0 flex justify-between">
        <Button size="sm" asChild>
          <Link href={`/campaigns/${campaign.id}`}>View Details</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
