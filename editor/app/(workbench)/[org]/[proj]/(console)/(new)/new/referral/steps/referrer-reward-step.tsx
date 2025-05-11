"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Users } from "lucide-react";

interface ReferrerRewardStepProps {
  data: any;
  updateData: (data: any) => void;
}

export function ReferrerRewardStep({
  data,
  updateData,
}: ReferrerRewardStepProps) {
  const [limitInvitations, setLimitInvitations] = useState(
    !!data.max_invitations_per_referrer
  );

  const handleLimitToggle = (checked: boolean) => {
    setLimitInvitations(checked);
    updateData({
      max_invitations_per_referrer: checked ? 10 : null,
    });
  };

  const updateMilestone = (index: number, field: string, value: any) => {
    const updatedMilestones = [...data.referrer_milestone_rewards];
    updatedMilestones[index] = {
      ...updatedMilestones[index],
      [field]: value,
    };
    updateData({ referrer_milestone_rewards: updatedMilestones });
  };

  const addMilestone = () => {
    const lastMilestone =
      data.referrer_milestone_rewards[
        data.referrer_milestone_rewards.length - 1
      ];
    const newThreshold = lastMilestone ? lastMilestone.threshold + 1 : 1;

    updateData({
      referrer_milestone_rewards: [
        ...data.referrer_milestone_rewards,
        { threshold: newThreshold, description: "", value: 0 },
      ],
    });
  };

  const removeMilestone = (index: number) => {
    const updatedMilestones = data.referrer_milestone_rewards.filter(
      (_: any, i: number) => i !== index
    );
    updateData({ referrer_milestone_rewards: updatedMilestones });
  };

  // Get currency label based on reward type
  const getCurrencyLabel = () => {
    switch (data.reward_currency_type) {
      case "draw-ticket":
        return "Tickets";
      case "discount":
        return "% Off";
      default:
        return data.reward_currency;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="bg-primary/10 p-3 rounded-full">
          <Users className="size-6 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-medium">Referrer Rewards</h3>
          <p className="text-muted-foreground">
            Define rewards for people who invite others to join your platform.
          </p>
        </div>
      </div>

      <div className="text-xs text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-md inline-flex items-center mb-2">
        You can change this later
      </div>

      <div className="space-y-6">
        <div className="flex items-center space-x-2">
          <Switch
            id="limit-invitations"
            checked={limitInvitations}
            onCheckedChange={handleLimitToggle}
          />
          <Label htmlFor="limit-invitations">
            Limit invitations per referrer
          </Label>
        </div>

        {limitInvitations && (
          <div className="pl-6 pt-2">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="1"
                max="1000"
                value={data.max_invitations_per_referrer || 10}
                onChange={(e) =>
                  updateData({
                    max_invitations_per_referrer:
                      Number.parseInt(e.target.value) || 0,
                  })
                }
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">
                invitations maximum
              </span>
            </div>
          </div>
        )}

        <div className="pt-4 border-t">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-medium">Milestone Rewards</h4>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addMilestone}
            >
              <Plus className="size-4 mr-2" />
              Add Milestone
            </Button>
          </div>

          <p className="text-sm text-muted-foreground mb-4">
            Set milestone rewards for referrers based on the number of
            successful invitations.
          </p>

          <div className="space-y-4">
            {data.referrer_milestone_rewards.map(
              (milestone: any, index: number) => (
                <div key={index} className="space-y-3 p-4 border rounded-md">
                  <div className="flex items-center justify-between">
                    <Label>Milestone {index + 1}</Label>
                    {index > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeMilestone(index)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label htmlFor={`threshold-${index}`} className="text-xs">
                        Invites
                      </Label>
                      <Input
                        id={`threshold-${index}`}
                        type="number"
                        min="1"
                        value={milestone.threshold}
                        onChange={(e) =>
                          updateMilestone(
                            index,
                            "threshold",
                            Number.parseInt(e.target.value) || 1
                          )
                        }
                      />
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor={`value-${index}`} className="text-xs">
                        Reward Value
                      </Label>
                      <Input
                        id={`value-${index}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={milestone.value}
                        onChange={(e) =>
                          updateMilestone(
                            index,
                            "value",
                            Number.parseFloat(e.target.value) || 0
                          )
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor={`description-${index}`} className="text-xs">
                      Description
                    </Label>
                    <Input
                      id={`description-${index}`}
                      placeholder={`${milestone.value} ${getCurrencyLabel()} reward`}
                      value={milestone.description}
                      onChange={(e) =>
                        updateMilestone(index, "description", e.target.value)
                      }
                    />
                  </div>
                </div>
              )
            )}
          </div>

          <div className="mt-4 p-4 bg-muted/20 rounded-md">
            <h5 className="font-medium text-sm mb-2">
              Milestone Rewards Explained
            </h5>
            <p className="text-sm text-muted-foreground">
              Milestone rewards encourage referrers to invite more people by
              increasing rewards as they reach certain thresholds.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
