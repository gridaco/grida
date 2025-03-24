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

export function CampaignCard({ data }: { data: Platform.WEST.Campaign }) {
  // This would normally be passed as props
  const campaign = {
    id: data.id,
    name: data.name,
    description: data.description ?? "(No description)",
    status: data.enabled ? "active" : "paused",
    open_at: data.scheduling_open_at,
    close_at: data.scheduling_close_at,
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
            {/* <div className="flex items-center gap-1">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span>{campaign.referrals} referrals</span>
            </div> */}
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            {campaign.open_at && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>
                  Started {new Date(campaign.open_at).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
      <CardFooter className="p-4 pt-0 flex justify-between">
        <Button size="sm">View Details</Button>
      </CardFooter>
    </Card>
  );
}
