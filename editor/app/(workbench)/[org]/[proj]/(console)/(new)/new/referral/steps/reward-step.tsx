"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Gift, Plus, Trash2, Users } from "lucide-react";
import { Platform } from "@/lib/platform";
interface RewardStepProps {
  data: Platform.WEST.Referral.Wizard.CampaignData;
  updateData: (
    data: Partial<Platform.WEST.Referral.Wizard.CampaignData>
  ) => void;
}

const currencies = [
  "XTS",
  "USD",
  "EUR",
  "GBP",
  "KRW",
  "JPY",
  "Points",
  "Credits",
];

export function RewardStep({ data, updateData }: RewardStepProps) {
  const [limitInvitations, setLimitInvitations] = useState(
    !!data.max_invitations_per_referrer
  );

  const handleCurrencyChange = (value: string) => {
    updateData({ reward_currency: value });
  };

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

  const updateInviteeReward = (field: string, value: any) => {
    updateData({
      invitee_onboarding_reward: {
        ...data.invitee_onboarding_reward,
        [field]: value,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div className="bg-primary/10 p-3 rounded-full">
          <Gift className="size-6 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-medium">Set up your reward structure</h3>
          <p className="text-muted-foreground">
            Define rewards for both referrers (people who invite others) and
            invitees (people who join through an invitation).
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="currency">Reward Currency</Label>
          <Select
            value={data.reward_currency}
            onValueChange={handleCurrencyChange}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select currency" />
            </SelectTrigger>
            <SelectContent>
              {currencies.map((currency) => (
                <SelectItem key={currency} value={currency}>
                  {currency}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

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
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Users className="size-5" />
              Referrer Rewards
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Set milestone rewards for referrers based on the number of
                successful invitations.
              </p>

              {data.referrer_milestone_rewards.map(
                (milestone: any, index: number) => (
                  <div
                    key={index}
                    className="space-y-3 pb-3 border-b last:border-0"
                  >
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
                        <Label
                          htmlFor={`threshold-${index}`}
                          className="text-xs"
                        >
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
                      <Label
                        htmlFor={`description-${index}`}
                        className="text-xs"
                      >
                        Description
                      </Label>
                      <Input
                        id={`description-${index}`}
                        placeholder={`${milestone.value} ${data.reward_currency} credit`}
                        value={milestone.description}
                        onChange={(e) =>
                          updateMilestone(index, "description", e.target.value)
                        }
                      />
                    </div>
                  </div>
                )
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={addMilestone}
              >
                <Plus className="size-4 mr-2" />
                Add Milestone
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Gift className="size-5" />
              Invitee Reward
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Set the reward for people who join through an invitation.
              </p>

              <div className="space-y-3">
                <div>
                  <Label htmlFor="invitee-value">Reward Value</Label>
                  <Input
                    id="invitee-value"
                    type="number"
                    min="0"
                    step="0.01"
                    value={data.invitee_onboarding_reward.value}
                    onChange={(e) =>
                      updateInviteeReward(
                        "value",
                        Number.parseFloat(e.target.value) || 0
                      )
                    }
                  />
                </div>

                <div>
                  <Label htmlFor="invitee-description">Description</Label>
                  <Input
                    id="invitee-description"
                    placeholder={`${data.invitee_onboarding_reward.value} ${data.reward_currency} welcome bonus`}
                    value={data.invitee_onboarding_reward.description}
                    onChange={(e) =>
                      updateInviteeReward("description", e.target.value)
                    }
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    This will be shown to invitees when they join.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
