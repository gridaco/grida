"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Target,
  Trash2,
  ArrowRight,
  Zap,
  Code,
  CheckCircle2,
  Laptop,
  ClipboardList,
} from "lucide-react";
import { Platform } from "@/lib/platform";

interface GoalsStepProps {
  data: Platform.WEST.Referral.Wizard.CampaignData;
  updateData: (data: any) => void;
}

export function GoalsStep({ data, updateData }: GoalsStepProps) {
  const [newTriggerName, setNewTriggerName] = useState("");
  const [showNewTriggerForm, setShowNewTriggerForm] = useState(false);
  const [platformType, setPlatformType] = useState(
    data.__prefers_builtin_platform
      ? "built-in"
      : data.__prefers_offline_manual
        ? "offline"
        : "custom"
  );

  const handlePlatformChange = (value: string) => {
    setPlatformType(value);
    updateData({
      __prefers_builtin_platform: value === "built-in",
      __prefers_offline_manual: value === "offline",
    });
  };

  const addGoal = () => {
    const newIndex =
      data.challenges.length > 0
        ? Math.max(...data.challenges.map((c: any) => c.index)) + 1
        : 0;

    updateData({
      challenges: [
        ...data.challenges,
        {
          index: newIndex,
          trigger_name: "",
          description: "",
          depends_on: null,
        },
      ],
    });
  };

  const removeGoal = (index: number) => {
    const updatedGoals = data.challenges.filter(
      (_: any, i: number) => i !== index
    );
    updateData({ challenges: updatedGoals });
  };

  const updateGoal = (index: number, field: string, value: any) => {
    const updatedGoals = [...data.challenges];
    updatedGoals[index] = {
      ...updatedGoals[index],
      [field]: value,
    };
    updateData({ challenges: updatedGoals });
  };

  const addNewTrigger = () => {
    if (newTriggerName.trim()) {
      const newTrigger = {
        name: newTriggerName.trim(),
        description: "",
      };

      // without duplicated names.
      const updatedTriggers = [
        ...data.triggers.filter((t) => t.name !== newTrigger.name),
        newTrigger,
      ];

      setNewTriggerName("");
      setShowNewTriggerForm(false);
      updateData({ triggers: updatedTriggers });
    }
  };

  // Generate a description of the goal sequence
  const getGoalSequenceDescription = () => {
    if (data.challenges.length === 0) {
      return "No goals defined yet. Add goals to create a conversion path for your invitees.";
    }

    const goalNames = data.challenges.map((goal: any, index: number) => {
      const trigger = data.triggers.find((t) => t.name === goal.trigger_name);
      return trigger ? trigger.name : `Goal ${index + 1}`;
    });

    if (goalNames.length === 1) {
      return `Invitees need to complete: ${goalNames[0]}`;
    }

    const lastGoal = goalNames.pop();
    return `Invitees need to complete: ${goalNames.join(" → ")} → ${lastGoal}`;
  };

  // Update the trigger display to include icons and delete functionality
  // First, add a function to handle trigger deletion
  const removeTrigger = (name: string) => {
    // Filter out the trigger with the matching ID
    const updatedTriggers = data.triggers.filter((t) => t.name !== name);

    // Also update any goals that were using this trigger
    const updatedGoals = data.challenges.map((goal: any) => {
      if (goal.trigger_name === name) {
        return { ...goal, trigger_name: "" };
      }
      return goal;
    });

    updateData({
      challenges: updatedGoals,
      triggers: updatedTriggers,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="bg-primary/10 p-3 rounded-full">
          <Target className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-medium">Choose Your Platform</h3>
          <p className="text-muted-foreground">
            Select how you want to track and manage your referral campaign
            goals.
          </p>
        </div>
      </div>

      <div className="text-xs text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-md inline-flex items-center mb-2">
        You can change this later
      </div>

      <Tabs
        value={platformType}
        onValueChange={handlePlatformChange}
        className="w-full"
      >
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="built-in" className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            <span>Built-in Platform</span>
          </TabsTrigger>
          <TabsTrigger value="custom" className="flex items-center gap-2">
            <Code className="h-4 w-4" />
            <span>My Platform</span>
          </TabsTrigger>
          <TabsTrigger value="offline" className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            <span>Offline / Manual</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="built-in" className="mt-6 space-y-6">
          <div className="flex items-start gap-4 p-4 bg-green-50 border border-green-100 rounded-md">
            <div className="bg-green-100 p-2 rounded-full">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <h4 className="text-base font-medium">
                Built-in Platform Selected
              </h4>
              <p className="text-sm text-muted-foreground">
                You&apos;ve chosen to use our built-in platform for your
                referral campaign.
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h5 className="font-medium">Benefits</h5>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                  <span>Easy and fast setup - ready in minutes</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                  <span>Pre-designed templates you can customize</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                  <span>Automatic tracking of referrals and conversions</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                  <span>Built-in analytics and reporting</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                  <span>No technical knowledge required</span>
                </li>
              </ul>
            </div>

            <div className="bg-muted/20 p-4 rounded-md">
              <h5 className="font-medium mb-2">What happens next?</h5>
              <ol className="space-y-2 text-sm list-decimal pl-5">
                <li>Choose from pre-designed templates</li>
                <li>Customize colors, text, and images</li>
                <li>Share your campaign link with initial referrers</li>
                <li>Monitor performance in real-time</li>
              </ol>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="custom" className="mt-6 space-y-6">
          <div className="flex items-start gap-4 p-4 bg-blue-50 border border-blue-100 rounded-md">
            <div className="bg-blue-100 p-2 rounded-full">
              <Laptop className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h4 className="text-base font-medium">
                Custom Website Integration
              </h4>
              <p className="text-sm text-muted-foreground">
                You&apos;ve chosen to integrate the referral campaign with your
                own website or app.
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="space-y-3">
              <h5 className="font-medium">Benefits</h5>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                  <span>Full customization of the user experience</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                  <span>Seamless integration with your existing website</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                  <span>Trigger events from your own backend or frontend</span>
                </li>
              </ul>
            </div>

            <div className="bg-muted/20 p-4 rounded-md">
              <h5 className="font-medium mb-2">Implementation Options</h5>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="font-medium">JavaScript SDK:</p>
                  <p className="text-muted-foreground">
                    Add our script to your website to track events
                  </p>
                </div>
                <div>
                  <p className="font-medium">API Integration:</p>
                  <p className="text-muted-foreground">
                    Call our API endpoints from your backend
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="font-medium">Available Triggers</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowNewTriggerForm(!showNewTriggerForm)}
              >
                {showNewTriggerForm ? "Cancel" : "Create Trigger"}
              </Button>
            </div>

            {showNewTriggerForm && (
              <div className="flex gap-2 items-center p-3 border rounded-md bg-muted/30">
                <Input
                  placeholder="New trigger name (e.g., complete_survey)"
                  value={newTriggerName}
                  onChange={(e) => setNewTriggerName(e.target.value)}
                  className="flex-1"
                />
                <Button size="sm" onClick={addNewTrigger}>
                  Add
                </Button>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {data.triggers.map((trigger) => (
                <div
                  key={trigger.name}
                  className="p-2 border rounded-md text-sm bg-muted/20 flex items-center justify-between group"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Target className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="truncate">{trigger.name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => removeTrigger(trigger.name)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="sr-only">Remove trigger</span>
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t">
            <div className="flex justify-between items-center">
              <h4 className="font-medium">Goal Sequence</h4>
              <Button
                variant="outline"
                size="sm"
                onClick={addGoal}
                disabled={data.challenges.length >= 5}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Goal
              </Button>
            </div>

            {/* Visual representation of the goal sequence */}
            <div className="p-4 bg-muted/20 rounded-md">
              <h5 className="text-sm font-medium mb-2">Conversion Path</h5>
              {data.challenges.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No goals defined yet
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {data.challenges.map((goal: any, index: number) => {
                    const trigger = data.triggers.find(
                      (t) => t.name === goal.trigger_name
                    );
                    return (
                      <div key={index} className="flex items-center">
                        <div className="bg-primary/10 text-primary px-3 py-1 rounded-md text-sm font-medium">
                          {trigger ? trigger.name : `Goal ${index + 1}`}
                        </div>
                        {index < data.challenges.length - 1 && (
                          <ArrowRight className="h-4 w-4 mx-1 text-muted-foreground" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-sm text-muted-foreground mt-3">
                {getGoalSequenceDescription()}
              </p>
            </div>

            {data.challenges.length === 0 ? (
              <div className="text-center p-6 border border-dashed rounded-md">
                <p className="text-muted-foreground">
                  No goals added yet. Add your first goal to get started.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {data.challenges.map((goal: any, index: number) => (
                  <div key={index} className="p-4 border rounded-md relative">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => removeGoal(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>

                    <div className="grid gap-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor={`goal-trigger-${index}`}>
                            Trigger
                          </Label>
                          <Select
                            value={goal.trigger_name}
                            onValueChange={(value) =>
                              updateGoal(index, "trigger_name", value)
                            }
                          >
                            <SelectTrigger id={`goal-trigger-${index}`}>
                              <SelectValue placeholder="Select trigger" />
                            </SelectTrigger>
                            <SelectContent>
                              {data.triggers.map((trigger) => (
                                <SelectItem
                                  key={trigger.name}
                                  value={trigger.name}
                                >
                                  {trigger.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {index > 0 && (
                          <div>
                            <Label htmlFor={`goal-depends-${index}`}>
                              Depends On
                            </Label>
                            <Select
                              value={goal.depends_on || ""}
                              onValueChange={(value) =>
                                updateGoal(index, "depends_on", value || null)
                              }
                            >
                              <SelectTrigger id={`goal-depends-${index}`}>
                                <SelectValue placeholder="Independent" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="independent">
                                  Independent
                                </SelectItem>
                                {data.challenges
                                  .slice(0, index)
                                  .map((prevGoal: any, i: number) => (
                                    <SelectItem
                                      key={i}
                                      value={prevGoal.index.toString()}
                                    >
                                      Goal {i + 1}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>

                      <div>
                        <Label htmlFor={`goal-desc-${index}`}>
                          Description
                        </Label>
                        <Textarea
                          id={`goal-desc-${index}`}
                          placeholder="Describe what the user needs to do..."
                          value={goal.description}
                          onChange={(e) =>
                            updateGoal(index, "description", e.target.value)
                          }
                          rows={2}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="offline" className="mt-6 space-y-6">
          <div className="flex items-start gap-4 p-4 bg-amber-50 border border-amber-100 rounded-md">
            <div className="bg-amber-100 p-2 rounded-full">
              <ClipboardList className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h4 className="text-base font-medium">
                Offline / Manual Tracking
              </h4>
              <p className="text-sm text-muted-foreground">
                You&apos;ve chosen to manually track referral goals and
                triggers.
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="space-y-3">
              <h5 className="font-medium">Benefits</h5>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <span>Perfect for businesses with offline components</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <span>Complete control over when triggers are activated</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <span>Manually verify actions before awarding rewards</span>
                </li>
              </ul>
            </div>

            <div className="bg-muted/20 p-4 rounded-md">
              <h5 className="font-medium mb-2">How It Works</h5>
              <ol className="space-y-2 text-sm list-decimal pl-5">
                <li>Define your goal sequence below</li>
                <li>Admins will manually track referral activities</li>
                <li>Use the admin dashboard to mark triggers as completed</li>
                <li>
                  Rewards are automatically calculated based on completed goals
                </li>
              </ol>
            </div>
          </div>

          {/* The rest of the offline tab content is similar to the custom tab */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="font-medium">Available Triggers</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowNewTriggerForm(!showNewTriggerForm)}
              >
                {showNewTriggerForm ? "Cancel" : "Create Trigger"}
              </Button>
            </div>

            {showNewTriggerForm && (
              <div className="flex gap-2 items-center p-3 border rounded-md bg-muted/30">
                <Input
                  placeholder="New trigger name (e.g., store_visit)"
                  value={newTriggerName}
                  onChange={(e) => setNewTriggerName(e.target.value)}
                  className="flex-1"
                />
                <Button size="sm" onClick={addNewTrigger}>
                  Add
                </Button>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {data.triggers.map((trigger) => (
                <div
                  key={trigger.name}
                  className="p-2 border rounded-md text-sm bg-muted/20 flex items-center justify-between group"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Target className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="truncate">{trigger.name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => removeTrigger(trigger.name)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="sr-only">Remove trigger</span>
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t">
            <div className="flex justify-between items-center">
              <h4 className="font-medium">Goal Sequence</h4>
              <Button
                variant="outline"
                size="sm"
                onClick={addGoal}
                disabled={data.challenges.length >= 5}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Goal
              </Button>
            </div>

            {/* Visual representation of the goal sequence */}
            <div className="p-4 bg-muted/20 rounded-md">
              <h5 className="text-sm font-medium mb-2">Conversion Path</h5>
              {data.challenges.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No goals defined yet
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {data.challenges.map((goal: any, index: number) => {
                    const trigger = data.triggers.find(
                      (t) => t.name === goal.trigger_name
                    );
                    return (
                      <div key={index} className="flex items-center">
                        <div className="bg-primary/10 text-primary px-3 py-1 rounded-md text-sm font-medium">
                          {trigger ? trigger.name : `Goal ${index + 1}`}
                        </div>
                        {index < data.challenges.length - 1 && (
                          <ArrowRight className="h-4 w-4 mx-1 text-muted-foreground" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-sm text-muted-foreground mt-3">
                {getGoalSequenceDescription()}
              </p>
            </div>

            {data.challenges.length === 0 ? (
              <div className="text-center p-6 border border-dashed rounded-md">
                <p className="text-muted-foreground">
                  No goals added yet. Add your first goal to get started.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {data.challenges.map((goal: any, index: number) => (
                  <div key={index} className="p-4 border rounded-md relative">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => removeGoal(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>

                    <div className="grid gap-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor={`goal-trigger-${index}`}>
                            Trigger
                          </Label>
                          <Select
                            value={goal.trigger_name}
                            onValueChange={(value) =>
                              updateGoal(index, "trigger_name", value)
                            }
                          >
                            <SelectTrigger id={`goal-trigger-${index}`}>
                              <SelectValue placeholder="Select trigger" />
                            </SelectTrigger>
                            <SelectContent>
                              {data.triggers.map((trigger) => (
                                <SelectItem
                                  key={trigger.name}
                                  value={trigger.name}
                                >
                                  {trigger.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {index > 0 && (
                          <div>
                            <Label htmlFor={`goal-depends-${index}`}>
                              Depends On
                            </Label>
                            <Select
                              value={goal.depends_on || ""}
                              onValueChange={(value) =>
                                updateGoal(index, "depends_on", value || null)
                              }
                            >
                              <SelectTrigger id={`goal-depends-${index}`}>
                                <SelectValue placeholder="Independent" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="independent">
                                  Independent
                                </SelectItem>
                                {data.challenges
                                  .slice(0, index)
                                  .map((prevGoal: any, i: number) => (
                                    <SelectItem
                                      key={i}
                                      value={prevGoal.index.toString()}
                                    >
                                      Goal {i + 1}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>

                      <div>
                        <Label htmlFor={`goal-desc-${index}`}>
                          Description
                        </Label>
                        <Textarea
                          id={`goal-desc-${index}`}
                          placeholder="Describe what the user needs to do..."
                          value={goal.description}
                          onChange={(e) =>
                            updateGoal(index, "description", e.target.value)
                          }
                          rows={2}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
