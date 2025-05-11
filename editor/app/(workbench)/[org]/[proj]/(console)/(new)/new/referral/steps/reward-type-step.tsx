"use client";

import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Gift,
  Users,
  User,
  Ticket,
  CreditCard,
  DollarSign,
  Sparkles,
} from "lucide-react";

interface RewardTypeStepProps {
  data: any;
  updateData: (data: any) => void;
}

export function RewardTypeStep({ data, updateData }: RewardTypeStepProps) {
  const handleRewardTypeChange = (value: string) => {
    updateData({ reward_strategy_type: value });
  };

  const handleCurrencyTypeChange = (value: string) => {
    updateData({ reward_currency_type: value });

    // Set default currency based on type
    let defaultCurrency = "XTS";
    if (value === "draw-ticket") defaultCurrency = "Tickets";
    else if (value === "discount") defaultCurrency = "% Off";

    updateData({ reward_currency: defaultCurrency });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="bg-primary/10 p-3 rounded-full">
          <Gift className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-medium">
            Configure Your Reward Structure
          </h3>
          <p className="text-muted-foreground">
            Choose who gets rewarded and what type of rewards you want to offer.
          </p>
        </div>
      </div>

      <div className="text-xs text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-md inline-flex items-center mb-2">
        You can change this later
      </div>

      <div className="space-y-8">
        <div>
          <Label className="text-base font-medium mb-3 block">
            Who gets rewarded?
          </Label>

          <RadioGroup
            value={data.reward_strategy_type}
            onValueChange={handleRewardTypeChange}
            className="grid grid-cols-1 md:grid-cols-3 gap-3"
          >
            <div className="flex items-start space-x-2 border p-4 rounded-md hover:bg-muted/20 h-full">
              <RadioGroupItem
                value="double-sided"
                id="double-sided"
                className="mt-1"
              />
              <div className="grid gap-1.5 w-full">
                <Label
                  htmlFor="double-sided"
                  className="font-medium flex items-center gap-2"
                >
                  <Users className="size-4 text-primary" />
                  Double-sided rewards
                </Label>
                <p className="text-sm text-muted-foreground">
                  Both referrers and invitees receive rewards.
                </p>
                <Badge variant="outline" className="w-fit">
                  Most effective
                </Badge>
              </div>
            </div>

            <div className="flex items-start space-x-2 border p-4 rounded-md hover:bg-muted/20 h-full">
              <RadioGroupItem
                value="referrer-only"
                id="referrer-only"
                className="mt-1"
              />
              <div className="grid gap-1.5 w-full">
                <Label
                  htmlFor="referrer-only"
                  className="font-medium flex items-center gap-2"
                >
                  <User className="size-4 text-primary" />
                  Referrer-only rewards
                </Label>
                <p className="text-sm text-muted-foreground">
                  Only people who refer others get rewards.
                </p>
                <Badge variant="outline" className="w-fit">
                  Good for existing users
                </Badge>
              </div>
            </div>

            <div className="flex items-start space-x-2 border p-4 rounded-md hover:bg-muted/20 h-full">
              <RadioGroupItem
                value="invitee-only"
                id="invitee-only"
                className="mt-1"
              />
              <div className="grid gap-1.5 w-full">
                <Label
                  htmlFor="invitee-only"
                  className="font-medium flex items-center gap-2"
                >
                  <User className="size-4 text-primary" />
                  Invitee-only rewards
                </Label>
                <p className="text-sm text-muted-foreground">
                  Only people who join through referrals get rewards.
                </p>
                <Badge variant="outline" className="w-fit">
                  Good for acquisition
                </Badge>
              </div>
            </div>
          </RadioGroup>
        </div>

        <div className="pt-4 border-t">
          <Label className="text-base font-medium mb-3 block">
            What type of rewards?
          </Label>

          <RadioGroup
            value={data.reward_currency_type}
            onValueChange={handleCurrencyTypeChange}
            className="grid grid-cols-1 md:grid-cols-2 gap-3"
          >
            <div className="flex items-start space-x-2 border p-4 rounded-md hover:bg-muted/20 h-full">
              <RadioGroupItem
                value="virtual-currency"
                id="virtual-currency"
                className="mt-1"
              />
              <div className="grid gap-1.5 w-full">
                <Label
                  htmlFor="virtual-currency"
                  className="font-medium flex items-center gap-2"
                >
                  <CreditCard className="size-4 text-primary" />
                  Virtual Currency
                </Label>
                <p className="text-sm text-muted-foreground">
                  Points, credits, or in-app currency that can be redeemed.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-2 border p-4 rounded-md hover:bg-muted/20 h-full">
              <RadioGroupItem
                value="draw-ticket"
                id="draw-ticket"
                className="mt-1"
              />
              <div className="grid gap-1.5 w-full">
                <Label
                  htmlFor="draw-ticket"
                  className="font-medium flex items-center gap-2"
                >
                  <Ticket className="size-4 text-primary" />
                  Draw Tickets
                </Label>
                <p className="text-sm text-muted-foreground">
                  Entries into a prize draw. More referrals mean more chances to
                  win.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-2 border p-4 rounded-md hover:bg-muted/20 h-full">
              <RadioGroupItem value="discount" id="discount" className="mt-1" />
              <div className="grid gap-1.5 w-full">
                <Label
                  htmlFor="discount"
                  className="font-medium flex items-center gap-2"
                >
                  <DollarSign className="size-4 text-primary" />
                  Discounts
                </Label>
                <p className="text-sm text-muted-foreground">
                  Percentage or fixed amount discounts on products or services.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-2 border p-4 rounded-md hover:bg-muted/20 h-full">
              <RadioGroupItem value="custom" id="custom" className="mt-1" />
              <div className="grid gap-1.5 w-full">
                <Label
                  htmlFor="custom"
                  className="font-medium flex items-center gap-2"
                >
                  <Sparkles className="size-4 text-primary" />
                  Custom Reward
                </Label>
                <p className="text-sm text-muted-foreground">
                  Define your own custom reward type and currency.
                </p>

                {data.reward_currency_type === "custom" && (
                  <div className="mt-2">
                    <Label htmlFor="custom-currency" className="text-sm">
                      Custom Currency Name
                    </Label>
                    <Select
                      value={data.reward_currency}
                      onValueChange={(value) =>
                        updateData({ reward_currency: value })
                      }
                    >
                      <SelectTrigger id="custom-currency" className="mt-1">
                        <SelectValue placeholder="Select currency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="XTS">XTS</SelectItem>
                        <SelectItem value="Points">Points</SelectItem>
                        <SelectItem value="Credits">Credits</SelectItem>
                        <SelectItem value="Coins">Coins</SelectItem>
                        <SelectItem value="Stars">Stars</SelectItem>
                        <SelectItem value="Gems">Gems</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>
          </RadioGroup>
        </div>
      </div>
    </div>
  );
}
