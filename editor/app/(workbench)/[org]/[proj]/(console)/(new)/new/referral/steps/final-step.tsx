"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import {
  CalendarIcon,
  CheckCircle2,
  Clock,
  Zap,
  Code,
  Gift,
  Users,
  User,
  ClipboardList,
} from "lucide-react";

interface FinalStepProps {
  data: any;
  updateData: (data: any) => void;
}

const timezones = [
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "Europe/London", label: "London (GMT)" },
  { value: "Europe/Paris", label: "Central European Time (CET)" },
  { value: "Asia/Tokyo", label: "Japan Standard Time (JST)" },
];

export function FinalStep({ data, updateData }: FinalStepProps) {
  const [schedulingType, setSchedulingType] = useState(
    data.scheduling.__prefers_start_now ? "now" : "scheduled"
  );

  const handleSchedulingTypeChange = (value: string) => {
    setSchedulingType(value);
    updateData({
      scheduling: {
        ...data.scheduling,
        __prefers_start_now: value === "now",
      },
    });
  };

  const updateScheduling = (field: string, value: any) => {
    updateData({
      scheduling: {
        ...data.scheduling,
        [field]: value,
      },
    });
  };

  // Get reward type icon
  const getRewardTypeIcon = () => {
    switch (data.reward_strategy_type) {
      case "double-sided":
        return <Users className="h-3.5 w-3.5 text-primary" />;
      case "referrer-only":
        return <User className="h-3.5 w-3.5 text-primary" />;
      case "invitee-only":
        return <Gift className="h-3.5 w-3.5 text-primary" />;
      default:
        return <Users className="h-3.5 w-3.5 text-primary" />;
    }
  };

  // Get reward type label
  const getRewardTypeLabel = () => {
    switch (data.reward_strategy_type) {
      case "double-sided":
        return "Double-sided Rewards";
      case "referrer-only":
        return "Referrer-only Rewards";
      case "invitee-only":
        return "Invitee-only Rewards";
      default:
        return "Double-sided Rewards";
    }
  };

  // Get currency type label
  const getCurrencyTypeLabel = () => {
    switch (data.reward_currency_type) {
      case "virtual-currency":
        return "Virtual Currency";
      case "draw-ticket":
        return "Draw Tickets";
      case "discount":
        return "Discounts";
      case "custom":
        return "Custom Reward";
      default:
        return "Virtual Currency";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="bg-primary/10 p-3 rounded-full">
          <CheckCircle2 className="size-6 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-medium">Ready to Launch</h3>
          <p className="text-muted-foreground">
            Review your campaign settings and decide when to launch.
          </p>
        </div>
      </div>

      <div className="text-xs text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-md inline-flex items-center mb-2">
        You can change this later
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between p-4 border rounded-md">
          <div>
            <Label htmlFor="campaign-enabled" className="font-medium">
              Campaign Status
            </Label>
            <p className="text-sm text-muted-foreground">
              Enable or disable this campaign
            </p>
          </div>
          <Switch
            id="campaign-enabled"
            checked={data.enabled}
            onCheckedChange={(checked) => updateData({ enabled: checked })}
          />
        </div>

        <div className="pt-4 border-t">
          <div className="flex items-start gap-4 mb-4">
            <Clock className="size-5 text-muted-foreground mt-0.5" />
            <div>
              <h4 className="font-medium">Campaign Scheduling</h4>
              <p className="text-sm text-muted-foreground">
                Decide when your campaign should start and end
              </p>
            </div>
          </div>

          <RadioGroup
            value={schedulingType}
            onValueChange={handleSchedulingTypeChange}
            className="space-y-4"
          >
            <div className="flex items-start space-x-2 p-3 border rounded-md">
              <RadioGroupItem value="now" id="start-now" className="mt-1" />
              <div className="grid gap-1.5">
                <Label htmlFor="start-now" className="font-medium">
                  Start immediately
                </Label>
                <p className="text-sm text-muted-foreground">
                  The campaign will be active as soon as you create it
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-2 p-3 border rounded-md">
              <RadioGroupItem
                value="scheduled"
                id="schedule"
                className="mt-1"
              />
              <div className="grid gap-3 w-full">
                <Label htmlFor="schedule" className="font-medium">
                  Schedule for later
                </Label>

                <div className="grid gap-2 pl-1">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="start-date">Start Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            id="start-date"
                            variant="outline"
                            className={`w-full justify-start text-left font-normal ${
                              schedulingType !== "scheduled" ? "opacity-50" : ""
                            }`}
                            disabled={schedulingType !== "scheduled"}
                          >
                            <CalendarIcon className="mr-2 size-4" />
                            {data.scheduling.scheduling_open_at ? (
                              format(
                                new Date(data.scheduling.scheduling_open_at),
                                "PPP"
                              )
                            ) : (
                              <span>Pick a date</span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={
                              data.scheduling.scheduling_open_at
                                ? new Date(data.scheduling.scheduling_open_at)
                                : undefined
                            }
                            onSelect={(date) =>
                              updateScheduling("scheduling_open_at", date)
                            }
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="end-date">End Date (Optional)</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            id="end-date"
                            variant="outline"
                            className={`w-full justify-start text-left font-normal ${
                              schedulingType !== "scheduled" ? "opacity-50" : ""
                            }`}
                            disabled={schedulingType !== "scheduled"}
                          >
                            <CalendarIcon className="mr-2 size-4" />
                            {data.scheduling.scheduling_close_at ? (
                              format(
                                new Date(data.scheduling.scheduling_close_at),
                                "PPP"
                              )
                            ) : (
                              <span>No end date</span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={
                              data.scheduling.scheduling_close_at
                                ? new Date(data.scheduling.scheduling_close_at)
                                : undefined
                            }
                            onSelect={(date) =>
                              updateScheduling("scheduling_close_at", date)
                            }
                            initialFocus
                            disabled={(date) => {
                              // Disable dates before the start date
                              return data.scheduling.scheduling_open_at
                                ? date <
                                    new Date(data.scheduling.scheduling_open_at)
                                : false;
                            }}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="scheduling_tz">Timezone</Label>
                    <Select
                      value={data.scheduling.scheduling_tz || "UTC"}
                      onValueChange={(value) =>
                        updateScheduling("scheduling_tz", value)
                      }
                      disabled={schedulingType !== "scheduled"}
                    >
                      <SelectTrigger
                        id="scheduling_tz"
                        className={
                          schedulingType !== "scheduled" ? "opacity-50" : ""
                        }
                      >
                        <SelectValue placeholder="Select scheduling_tz" />
                      </SelectTrigger>
                      <SelectContent>
                        {timezones.map((tz) => (
                          <SelectItem key={tz.value} value={tz.value}>
                            {tz.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          </RadioGroup>
        </div>

        <div className="pt-4 border-t">
          <h4 className="font-medium mb-3">Campaign Summary</h4>
          <div className="p-4 border rounded-md bg-muted/10">
            <div className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-2 py-1 border-b">
                <div className="text-muted-foreground">Name:</div>
                <div className="font-medium">
                  {data.name || "Unnamed Campaign"}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 py-1 border-b">
                <div className="text-muted-foreground">Status:</div>
                <div className="font-medium">
                  {data.enabled ? "Enabled" : "Disabled"}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 py-1 border-b">
                <div className="text-muted-foreground">Reward Type:</div>
                <div className="font-medium flex items-center gap-1">
                  {getRewardTypeIcon()}
                  <span>{getRewardTypeLabel()}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 py-1 border-b">
                <div className="text-muted-foreground">Reward Currency:</div>
                <div className="font-medium">
                  {getCurrencyTypeLabel()} ({data.reward_currency})
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 py-1 border-b">
                <div className="text-muted-foreground">Platform:</div>
                <div className="font-medium flex items-center gap-1">
                  {data.__prefers_builtin_platform ? (
                    <>
                      <Zap className="h-3.5 w-3.5 text-primary" />
                      <span>Built-in Platform</span>
                    </>
                  ) : data.__prefers_offline_manual ? (
                    <>
                      <ClipboardList className="h-3.5 w-3.5 text-amber-600" />
                      <span>Offline / Manual</span>
                    </>
                  ) : (
                    <>
                      <Code className="h-3.5 w-3.5 text-blue-500" />
                      <span>My Platform</span>
                    </>
                  )}
                </div>
              </div>
              {(data.reward_strategy_type === "double-sided" ||
                data.reward_strategy_type === "referrer-only") && (
                <div className="grid grid-cols-2 gap-2 py-1 border-b">
                  <div className="text-muted-foreground">
                    Referrer Milestones:
                  </div>
                  <div className="font-medium">
                    {data.referrer_milestone_rewards.length}
                  </div>
                </div>
              )}
              {!data.__prefers_builtin_platform && (
                <div className="grid grid-cols-2 gap-2 py-1 border-b">
                  <div className="text-muted-foreground">Goals:</div>
                  <div className="font-medium">{data.challenges.length}</div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 py-1">
                <div className="text-muted-foreground">Launch:</div>
                <div className="font-medium">
                  {schedulingType === "now"
                    ? "Immediate"
                    : data.scheduling.scheduling_open_at
                      ? `Scheduled for ${format(new Date(data.scheduling.scheduling_open_at), "PPP")}`
                      : "Not scheduled"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
