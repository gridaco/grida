"use client";
import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Platform } from "@/lib/platform";

export function CampaignCard({
  data,
}: {
  data: Platform.WEST.Referral.Campaign;
}) {
  const campaign = {
    id: data.id,
    title: data.title,
    description: data.description ?? "(No description)",
    status: data.enabled ? "active" : "paused",
    open_at: data.scheduling_open_at,
    close_at: data.scheduling_close_at,
  };

  return (
    <Card size="sm" className="overflow-hidden">
      <CardHeader>
        <CardAction>
          <Badge variant="outline">
            {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
          </Badge>
        </CardAction>
        <CardTitle>{campaign.title}</CardTitle>
        <CardDescription className="line-clamp-1">
          {campaign.description?.substring(0, 100) ?? "(No description)"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {campaign.open_at && (
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Clock className="size-3" />
            <span>
              Started {new Date(campaign.open_at).toLocaleDateString()}
            </span>
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button size="sm">View Details</Button>
      </CardFooter>
    </Card>
  );
}
