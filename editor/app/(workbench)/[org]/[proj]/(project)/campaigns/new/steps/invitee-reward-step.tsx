"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Gift } from "lucide-react";

interface InviteeRewardStepProps {
  data: any;
  updateData: (data: any) => void;
}

export function InviteeRewardStep({
  data,
  updateData,
}: InviteeRewardStepProps) {
  const updateInviteeReward = (field: string, value: any) => {
    updateData({
      invitee_onboarding_reward: {
        ...data.invitee_onboarding_reward,
        [field]: value,
      },
    });
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
          <Gift className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-medium">Invitee Rewards</h3>
          <p className="text-muted-foreground">
            Define rewards for people who join through an invitation.
          </p>
        </div>
      </div>

      <div className="text-xs text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-md inline-flex items-center mb-2">
        You can change this later
      </div>

      <div className="space-y-6 p-4 border rounded-md">
        <h4 className="font-medium">Welcome Reward</h4>
        <p className="text-sm text-muted-foreground">
          Set the reward for people who join through an invitation. This
          incentivizes new users to accept referrals.
        </p>

        <div className="space-y-4">
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
            <p className="text-xs text-muted-foreground mt-1">
              The amount of {getCurrencyLabel()} the invitee will receive.
            </p>
          </div>

          <div>
            <Label htmlFor="invitee-description">Description</Label>
            <Input
              id="invitee-description"
              placeholder={`${data.invitee_onboarding_reward.value} ${getCurrencyLabel()} welcome bonus`}
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

      <div className="p-4 bg-muted/20 rounded-md">
        <h4 className="font-medium text-sm mb-2">
          Invitee Rewards Best Practices
        </h4>
        <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc pl-5">
          <li>Make the reward valuable enough to motivate action</li>
          <li>Keep the reward description clear and compelling</li>
          <li>Consider time-limited offers to create urgency</li>
        </ul>
      </div>
    </div>
  );
}
