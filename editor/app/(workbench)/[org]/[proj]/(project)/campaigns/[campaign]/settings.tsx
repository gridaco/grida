"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { CalendarIcon, InfoIcon } from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import toast from "react-hot-toast";
import { createClientWestClient } from "@/lib/supabase/client";
import { Platform } from "@/lib/platform";
import { Spinner } from "@/components/spinner";

// This would come from your API or database
const campaignTypes = [
  { value: "referral", label: "Referral" },
  { value: "promotion", label: "Promotion" },
  { value: "seasonal", label: "Seasonal" },
  { value: "event", label: "Event" },
];

// Timezone options
const timezones = [
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "Asia/Tokyo", label: "Japan Standard Time (JST)" },
  { value: "Europe/London", label: "Greenwich Mean Time (GMT)" },
];

// Form schema based on the database structure
const formSchema = z.object({
  name: z.string().min(1).max(40, {
    message: "Campaign name must be between 1 and 40 characters",
  }),
  type: z.string({
    required_error: "Please select a campaign type",
  }),
  description: z.string().optional(),
  is_participant_name_exposed_to_public_dangerously: z.boolean().default(false),
  max_supply_init_for_new_mint_token: z.number().int().nullable(),
  enabled: z.boolean().default(true),
  scheduling_open_at: z.date().nullable(),
  scheduling_close_at: z.date().nullable(),
  scheduling_tz: z.string().nullable(),
  public: z.any().default({}),
});

type CampaignFormValues = z.infer<typeof formSchema>;

function useCampaign(id: string) {
  const [campaign, setCampaign] = useState<Platform.WEST.Campaign | null>(null);
  const client = useMemo(() => createClientWestClient(), []);

  useEffect(() => {
    client
      .from("campaign")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data, error }) => {
        if (error) return;
        if (data) setCampaign(data as Platform.WEST.Campaign);
      });
  }, [client, id]);

  const update = useCallback(
    async (data: CampaignFormValues) => {
      const { data: updated, error } = await client
        .from("campaign")
        .update({
          name: data.name,
          description: data.description,
          enabled: data.enabled,
          scheduling_tz: data.scheduling_tz,
          scheduling_open_at: data.scheduling_open_at?.toISOString(),
          scheduling_close_at: data.scheduling_close_at?.toISOString(),
          is_participant_name_exposed_to_public_dangerously:
            data.is_participant_name_exposed_to_public_dangerously,
          max_supply_init_for_new_mint_token:
            data.max_supply_init_for_new_mint_token,
          public: data.public,
        })
        .eq("id", id)
        .select("*");

      if (error) {
        return false;
      }

      if (data) {
        setCampaign(updated as unknown as Platform.WEST.Campaign);
        return true;
      }

      return false;
    },
    [id, client]
  );

  return { campaign, update };
}

export default function CampaignSettings({
  campaign_id,
}: {
  campaign_id: string;
}) {
  const { campaign, update } = useCampaign(campaign_id);

  if (!campaign) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <Body
      campaign_id={campaign_id}
      defaultValues={campaign as Partial<CampaignFormValues>}
      onSubmit={update}
    />
  );
}

function Body({
  campaign_id,
  defaultValues,
  onSubmit,
}: {
  campaign_id: string;
  defaultValues: Partial<CampaignFormValues>;
  onSubmit: (data: CampaignFormValues) => Promise<boolean>;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<CampaignFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues,
  });

  async function handleSubmit(data: CampaignFormValues) {
    setIsSubmitting(true);
    const ok = await onSubmit(data);

    if (ok) {
      toast.success("Campaign settings saved");
    } else {
      console.error("Error saving campaign settings");
      toast.error("Error saving settings");
    }

    setIsSubmitting(false);
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Campaign Settings</CardTitle>
        <CardDescription>
          Configure the settings for your campaign.
        </CardDescription>
      </CardHeader>

      <hr className="mb-4" />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <CardContent className="space-y-8">
            {/* General Settings Section */}
            <div>
              <h3 className="text-lg font-medium">General Settings</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Configure the basic settings for your campaign.
              </p>
              <div className="space-y-8">
                <FormItem>
                  <FormLabel>Campaign ID</FormLabel>
                  <Input readOnly disabled value={campaign_id} />
                  <FormDescription>
                    Your campaign's unique identifier.
                  </FormDescription>
                  <FormMessage />
                </FormItem>

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Campaign Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Spring 2025 Campaign" {...field} />
                      </FormControl>
                      <FormDescription>
                        Enter a name for your campaign (1-40 characters).
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Campaign Type</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a campaign type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {campaignTypes.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Select the type of campaign you want to create.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe your campaign..."
                          className="resize-none"
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormDescription>
                        Provide a brief description of your campaign.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="enabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Campaign Status
                        </FormLabel>
                        <FormDescription>
                          Enable or disable this campaign.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Separator />

            {/* Scheduling Section */}
            <div>
              <h3 className="text-lg font-medium">Campaign Scheduling</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Set the start and end dates for your campaign.
              </p>
              <div className="space-y-8">
                <FormField
                  control={form.control}
                  name="scheduling_open_at"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Start Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className={`w-full justify-start text-left font-normal ${!field.value && "text-muted-foreground"}`}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {field.value
                                ? format(field.value, "PPP")
                                : "Select start date"}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value || undefined}
                            onSelect={field.onChange}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormDescription>
                        When the campaign will start.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="scheduling_close_at"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>End Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className={`w-full justify-start text-left font-normal ${!field.value && "text-muted-foreground"}`}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {field.value
                                ? format(field.value, "PPP")
                                : "Select end date"}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value || undefined}
                            onSelect={field.onChange}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormDescription>
                        When the campaign will end.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="scheduling_tz"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Timezone</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value || undefined}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select timezone" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {timezones.map((tz) => (
                            <SelectItem key={tz.value} value={tz.value}>
                              {tz.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        The timezone for the campaign schedule.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Separator />

            {/* Advanced Settings Section */}
            <div>
              <h3 className="text-lg font-medium">Advanced Settings</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Configure advanced options for your campaign.
              </p>
              <div className="space-y-8">
                <FormField
                  control={form.control}
                  name="max_supply_init_for_new_mint_token"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Maximum Supply for New Mint Tokens</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Enter maximum supply"
                          {...field}
                          value={field.value === null ? "" : field.value}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === ""
                                ? null
                                : Number.parseInt(e.target.value)
                            )
                          }
                        />
                      </FormControl>
                      <FormDescription>
                        Maximum number of tokens per host. Leave empty for
                        unlimited.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="is_participant_name_exposed_to_public_dangerously"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950">
                      <div className="space-y-0.5">
                        <div className="flex items-center">
                          <FormLabel className="text-base mr-2">
                            Expose Participant Names Publicly
                          </FormLabel>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <InfoIcon className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">
                                  Warning: This will make participant names
                                  visible to the public. Use with caution.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <FormDescription className="text-yellow-700 dark:text-yellow-400">
                          This is potentially dangerous and exposes user data
                          publicly.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="public"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Public JSON Data</FormLabel>
                      <FormControl>
                        <Textarea
                          className="font-mono h-32 resize-none"
                          placeholder="{}"
                          value={JSON.stringify(field.value, null, 2)}
                          onChange={(e) => {
                            try {
                              field.onChange(JSON.parse(e.target.value));
                            } catch (error) {
                              // Allow invalid JSON during editing
                              console.log(
                                "Invalid JSON, not updating form value"
                              );
                            }
                          }}
                        />
                      </FormControl>
                      <FormDescription>
                        Additional JSON data for the campaign. Must be valid
                        JSON.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex justify-end">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Campaign Settings"}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
