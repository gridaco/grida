"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Control } from "react-hook-form";
import { useForm } from "react-hook-form";
import { z } from "zod/v3";
import { CalendarIcon, InfoIcon } from "lucide-react";
import { format } from "date-fns";
import { useCampaign } from "../store";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  createBrowserFormsClient,
  createBrowserWestReferralClient,
} from "@/lib/supabase/client";
import { Platform } from "@/lib/platform";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes-warning";
import { DeleteConfirmationAlertDialog } from "@/components/dialogs/delete-confirmation-dialog";
import { useProject, useTags } from "@/scaffolds/workspace";
import { useRouter } from "next/navigation";
import type { Database } from "@app/database";
import { TagInput } from "@/components/tag";

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
  title: z.string().min(1).max(256, {
    message: "Campaign title must be between 1 and 256 characters",
  }),
  description: z.string().optional(),
  is_invitee_profile_exposed_to_public_dangerously: z.boolean().default(false),
  is_referrer_profile_exposed_to_public_dangerously: z.boolean().default(false),
  max_invitations_per_referrer: z.number().int().nullable(),
  enabled: z.boolean().default(true),
  scheduling_open_at: z.date().nullable(),
  scheduling_close_at: z.date().nullable(),
  scheduling_tz: z.string().nullable(),
  public: z.any().default({}),
  ciam_invitee_on_claim_tag_names: z.array(z.string()).default([]),
});

type CampaignFormValues = z.infer<typeof formSchema>;

function useCampaignData(id: string) {
  const [campaign, setCampaign] =
    useState<Platform.WEST.Referral.Campaign | null>(null);
  const client = useMemo(() => createBrowserWestReferralClient(), []);

  useEffect(() => {
    client
      .from("campaign")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data, error }) => {
        if (error) return;
        if (data) setCampaign(data as Platform.WEST.Referral.Campaign);
      });
  }, [client, id]);
  const update = useCallback(
    async (data: CampaignFormValues) => {
      const { data: updated, error } = await client
        .from("campaign")
        .update({
          title: data.title,
          description: data.description,
          enabled: data.enabled,
          scheduling_tz: data.scheduling_tz,
          scheduling_open_at: data.scheduling_open_at?.toISOString(),
          scheduling_close_at: data.scheduling_close_at?.toISOString(),
          is_invitee_profile_exposed_to_public_dangerously:
            data.is_invitee_profile_exposed_to_public_dangerously,
          is_referrer_profile_exposed_to_public_dangerously:
            data.is_referrer_profile_exposed_to_public_dangerously,
          max_invitations_per_referrer: data.max_invitations_per_referrer,
          public: data.public,
          ciam_invitee_on_claim_tag_names: data.ciam_invitee_on_claim_tag_names,
        })
        .eq("id", id)
        .select("*");

      if (error) {
        return false;
      }

      if (data) {
        setCampaign(updated as unknown as Platform.WEST.Referral.Campaign);
        return true;
      }

      return false;
    },
    [id, client]
  );

  return { campaign, update };
}

export default function CampaignSettings() {
  const { id } = useCampaign();
  const { campaign, update } = useCampaignData(id);

  if (!campaign) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <Body
      campaign_id={id}
      project_id={campaign.project_id}
      defaultValues={campaign as Partial<CampaignFormValues>}
      onSubmit={update}
    />
  );
}

function ComingSoonCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Coming Soon</CardTitle>
        <CardDescription>This feature is under development</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-12">
          <div className="rounded-full bg-muted p-4 mb-4">
            <InfoIcon className="size-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">Feature in Development</h3>
          <p className="text-sm text-muted-foreground text-center max-w-sm">
            We&apos;re working on this feature. Please check back later for
            updates.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function Body({
  campaign_id,
  project_id,
  defaultValues,
  onSubmit,
}: {
  campaign_id: string;
  project_id: number;
  defaultValues: Partial<CampaignFormValues>;
  onSubmit: (data: CampaignFormValues) => Promise<boolean>;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("general");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const project = useProject();
  const router = useRouter();

  const form = useForm<CampaignFormValues>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: defaultValues,
  });

  // Track form dirty state
  const isDirty = form.formState.isDirty;

  // Use the unsaved changes warning hook
  useUnsavedChangesWarning(
    () => isDirty,
    "You have unsaved campaign settings. Are you sure you want to leave?"
  );

  async function handleSubmit(data: CampaignFormValues) {
    setIsSubmitting(true);
    const ok = await onSubmit(data);

    if (ok) {
      toast.success("Campaign settings saved");
      // Reset form state after successful save
      form.reset(data);
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
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="milestone">Quest Milestone</TabsTrigger>
            <TabsTrigger value="rewards">Rewards</TabsTrigger>
            <TabsTrigger value="challenges">Challenges</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="tagging">Customer Tagging</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
            <TabsTrigger
              value="danger"
              className="text-destructive data-[state=active]:text-destructive"
            >
              Danger Zone
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>

      <hr className="mb-4" />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <CardContent className="space-y-8">
            {activeTab === "general" && (
              <div>
                <h3 className="text-lg font-medium">General Settings</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Configure the basic settings for your campaign.
                </p>
                <div className="space-y-8">
                  {/* NOTE: FormLabel/FormDescription require FormField context. */}
                  <div className="space-y-2">
                    <Label>Campaign ID</Label>
                    <Input readOnly disabled value={campaign_id} />
                    <p className="text-sm text-muted-foreground">
                      Your campaign&apos;s unique identifier.
                    </p>
                  </div>

                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Campaign Title</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Spring 2025 Campaign"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Enter a title for your campaign (1-40 characters).
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

                  <Separator />

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
                                    <CalendarIcon className="size-4" />
                                    {field.value
                                      ? format(field.value, "PPP")
                                      : "Select start date"}
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent
                                className="w-auto p-0"
                                align="start"
                              >
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
                                    <CalendarIcon className="size-4" />
                                    {field.value
                                      ? format(field.value, "PPP")
                                      : "Select end date"}
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent
                                className="w-auto p-0"
                                align="start"
                              >
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
                </div>
              </div>
            )}

            {activeTab === "tagging" && (
              <CampaignTaggingSection control={form.control} />
            )}

            {activeTab === "milestone" && <ComingSoonCard />}
            {activeTab === "rewards" && <ComingSoonCard />}
            {activeTab === "challenges" && <ComingSoonCard />}
            {activeTab === "events" && <ComingSoonCard />}

            {activeTab === "security" && (
              <div>
                <h3 className="text-lg font-medium">Security Settings</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Configure security and privacy settings for your campaign.
                </p>
                <div className="space-y-8">
                  <FormField
                    control={form.control}
                    name="is_invitee_profile_exposed_to_public_dangerously"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950">
                        <div className="space-y-0.5">
                          <div className="flex items-center">
                            <FormLabel className="text-base mr-2">
                              Expose Invitee Profiles Publicly
                            </FormLabel>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <InfoIcon className="size-4 text-yellow-600 dark:text-yellow-400" />
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
                    name="is_referrer_profile_exposed_to_public_dangerously"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950">
                        <div className="space-y-0.5">
                          <div className="flex items-center">
                            <FormLabel className="text-base mr-2">
                              Expose Referrer Profiles Publicly
                            </FormLabel>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <InfoIcon className="size-4 text-yellow-600 dark:text-yellow-400" />
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
                </div>
              </div>
            )}

            {activeTab === "advanced" && (
              <div>
                <h3 className="text-lg font-medium">Advanced Settings</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Configure advanced options for your campaign.
                </p>
                <div className="space-y-8">
                  <FormField
                    control={form.control}
                    name="max_invitations_per_referrer"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Maximum Supply for New Mint Tokens
                        </FormLabel>
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

                  <CampaignPublicDataFields
                    control={form.control}
                    projectId={project_id}
                  />
                </div>
              </div>
            )}

            {activeTab === "danger" && (
              <div>
                <h3 className="text-lg font-medium text-destructive">
                  Danger Zone
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Irreversible actions for this campaign.
                </p>
                <div className="rounded-lg border border-destructive/50 p-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium">Delete Campaign</h4>
                      <p className="text-sm text-muted-foreground">
                        Permanently delete this campaign and all associated
                        data, including participants, rewards, challenges, and
                        events. This action cannot be undone.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => setDeleteDialogOpen(true)}
                    >
                      Delete Campaign
                    </Button>
                  </div>
                </div>
                <DeleteConfirmationAlertDialog
                  title="Delete Campaign"
                  description={`This action is irreversible. This will permanently delete the campaign and all associated data including participants, rewards, challenges, and events. Type the campaign title to confirm.`}
                  match={defaultValues.title ?? "Untitled Campaign"}
                  data={{ id: campaign_id }}
                  open={deleteDialogOpen}
                  onOpenChange={setDeleteDialogOpen}
                  onDelete={async () => {
                    const res = await fetch(
                      `/private/west/campaigns/${campaign_id}`,
                      {
                        method: "DELETE",
                        headers: {
                          "x-grida-editor-user-current-project-id":
                            project.id.toString(),
                        },
                      }
                    );
                    if (!res.ok) {
                      const body = await res.json().catch(() => ({}));
                      toast.error(body.error ?? "Failed to delete campaign");
                      return false;
                    }
                    toast.success("Campaign deleted");
                    router.push(
                      `/${project.organization_name}/${project.name}/campaigns`
                    );
                    return true;
                  }}
                />
              </div>
            )}
          </CardContent>

          <Separator className="my-4" />

          <CardFooter className="flex justify-end">
            <Button
              type="submit"
              disabled={!isDirty || isSubmitting}
              className="min-w-[120px]"
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <Spinner className="size-4" />
                  <span>Saving...</span>
                </div>
              ) : (
                "Save Changes"
              )}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}

function CampaignTaggingSection({
  control,
}: {
  control: Control<CampaignFormValues>;
}) {
  const { tags: projectTags } = useTags();

  const autocompleteOptions = useMemo(
    () => projectTags.map((t) => ({ id: t.name, text: t.name })),
    [projectTags]
  );

  const [activeTagIndex, setActiveTagIndex] = useState<number | null>(null);

  return (
    <div>
      <h3 className="text-lg font-medium">Customer Tagging</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Automatically tag customers when they join this campaign. Tags are
        applied once (add-only) and will not be removed if changed later.
      </p>
      <div className="space-y-8">
        <FormField
          control={control}
          name="ciam_invitee_on_claim_tag_names"
          render={({ field }) => {
            const tags = field.value ?? [];
            return (
              <FormItem>
                <FormLabel>Invitee tags (on claim)</FormLabel>
                <FormControl>
                  <TagInput
                    tags={tags.map((t) => ({ id: t, text: t }))}
                    setTags={(newTags) => {
                      const resolved =
                        typeof newTags === "function"
                          ? newTags(tags.map((t) => ({ id: t, text: t })))
                          : newTags;
                      field.onChange(resolved.map((t) => t.text));
                    }}
                    activeTagIndex={activeTagIndex}
                    setActiveTagIndex={setActiveTagIndex}
                    enableAutocomplete={autocompleteOptions.length > 0}
                    autocompleteOptions={autocompleteOptions}
                    placeholder="Add tags"
                  />
                </FormControl>
                <FormDescription>
                  These tags will be automatically applied to the invitee&apos;s
                  customer profile when they claim an invitation.
                </FormDescription>
                <FormMessage />
              </FormItem>
            );
          }}
        />
      </div>
    </div>
  );
}

function CampaignPublicDataFields({
  control,
  projectId,
}: {
  control: Control<CampaignFormValues>;
  projectId: number;
}) {
  const formsClient = useMemo(() => createBrowserFormsClient(), []);
  const [publicJsonOpen, setPublicJsonOpen] = useState(false);
  const [forms, setForms] = useState<
    Array<
      Pick<Database["grida_forms"]["Tables"]["form"]["Row"], "id" | "title">
    >
  >([]);
  const [formsLoading, setFormsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFormsLoading(true);
    (async () => {
      try {
        const { data } = await formsClient
          .from("form")
          .select("id,title")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false });

        if (cancelled) return;
        setForms(
          (data ?? []) as Array<
            Pick<
              Database["grida_forms"]["Tables"]["form"]["Row"],
              "id" | "title"
            >
          >
        );
      } finally {
        if (cancelled) return;
        setFormsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [formsClient, projectId]);

  return (
    <FormField
      control={control}
      name="public"
      render={({ field, fieldState }) => (
        <div>
          <FieldGroup>
            <Field>
              <FieldLabel>Signup Form ID</FieldLabel>
              <SignupFormIdSelect
                value={getSignupFormIdFromPublic(field.value)}
                forms={forms}
                loading={formsLoading}
                onChange={(next) => {
                  field.onChange(setSignupFormIdInPublic(field.value, next));
                }}
              />
              <FieldDescription>
                Convenience field for{" "}
                <code className="font-mono text-xs">
                  public[&quot;signup-form-id&quot;]
                </code>
                . Used by the public invitation page.
              </FieldDescription>
              <FieldError>{fieldState.error?.message}</FieldError>
            </Field>

            <FieldSeparator />

            <Field>
              <Collapsible
                open={publicJsonOpen}
                onOpenChange={setPublicJsonOpen}
              >
                <div className="flex items-center justify-between">
                  <FieldLabel>Public JSON Data (read-only)</FieldLabel>
                  <CollapsibleTrigger asChild>
                    <Button type="button" variant="ghost" size="sm">
                      {publicJsonOpen ? "Hide" : "Show"}
                    </Button>
                  </CollapsibleTrigger>
                </div>
                <FieldDescription>
                  Additional JSON data for the campaign (not editable in UI).
                </FieldDescription>
                <CollapsibleContent>
                  <div className="pt-2">
                    <Textarea
                      className="font-mono h-32 resize-none"
                      placeholder="{}"
                      value={JSON.stringify(field.value, null, 2)}
                      readOnly
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </Field>
          </FieldGroup>
        </div>
      )}
    />
  );
}

type FormOption = Pick<
  Database["grida_forms"]["Tables"]["form"]["Row"],
  "id" | "title"
>;

function getSignupFormIdFromPublic(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  if (!("signup-form-id" in value)) return undefined;
  const v = String((value as Record<string, unknown>)["signup-form-id"] ?? "");
  return v ? v : undefined;
}

function setSignupFormIdInPublic(
  value: unknown,
  signupFormId: string | undefined
): Record<string, unknown> {
  const base =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  if (!signupFormId) {
    const { ["signup-form-id"]: _, ...rest } = base;
    return rest;
  }

  return { ...base, "signup-form-id": signupFormId };
}

function SignupFormIdSelect({
  value,
  forms,
  loading,
  onChange,
}: {
  value?: string;
  forms: FormOption[];
  loading: boolean;
  onChange: (next?: string) => void;
}) {
  // Radix Select forbids empty string item values; use a sentinel.
  const NONE = "__none__";

  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v === NONE ? undefined : v)}
      disabled={loading}
    >
      <SelectTrigger className="w-full">
        {/* TODO(west-referral): Consider a searchable combobox UX */}
        <SelectValue
          placeholder={loading ? "Loading forms..." : "Select a form"}
        />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>None</SelectItem>
        {forms.map((f) => (
          <SelectItem key={f.id} value={f.id}>
            {f.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
