"use client";

import type React from "react";

import { useState, useMemo } from "react";
import { GeneralStep } from "./steps/general-step";
import { RewardTypeStep } from "./steps/reward-type-step";
import { ReferrerRewardStep } from "./steps/referrer-reward-step";
import { InviteeRewardStep } from "./steps/invitee-reward-step";
import { GoalsStep } from "./steps/goals-step";
import { ConversionStep } from "./steps/conversion-step";
import { SecurityStep } from "./steps/security-step";
import { FinalStep } from "./steps/final-step";
import { WizardNav } from "./wizard-nav";
import { Platform } from "@/lib/platform";

const seedTriggers = [
  { name: "sign_up", description: "User signed up" },
  { name: "complete_profile", description: "User completed their profile" },
  { name: "first_purchase", description: "User made their first purchase" },
  { name: "share_on_social", description: "User shared on social media" },
  { name: "invite_friend", description: "User invited a friend" },
];

const initialData: Platform.WEST.Referral.Wizard.CampaignData = {
  name: "",
  description: "",
  reward_strategy_type: "double-sided",
  reward_currency_type: "virtual-currency",
  reward_currency: "USD",
  conversion_currency: "USD",
  conversion_value: null,
  max_invitations_per_referrer: null,
  referrer_milestone_rewards: [{ threshold: 1, description: "", value: 0 }],
  invitee_onboarding_reward: { description: "", value: 0 },
  __prefers_builtin_platform: true,
  __prefers_offline_manual: false,
  challenges: [],
  triggers: seedTriggers,
  is_referrer_name_exposed_to_public_dangerously: false,
  is_invitee_name_exposed_to_public_dangerously: false,
  enabled: true,
  scheduling: {
    __prefers_start_now: true,
    scheduling_open_at: null,
    scheduling_close_at: null,
    scheduling_tz: null,
  },
};

type Step = {
  title: string;
  description: string;
  component: React.ComponentType<{
    data: Platform.WEST.Referral.Wizard.CampaignData;
    updateData: (
      data: Partial<Platform.WEST.Referral.Wizard.CampaignData>
    ) => void;
  }>;
};

interface CampaignWizardProps {
  onComplete: (data: Platform.WEST.Referral.Wizard.CampaignData) => void;
}

export function CampaignWizard({ onComplete }: CampaignWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [campaignData, setCampaignData] =
    useState<Platform.WEST.Referral.Wizard.CampaignData>(initialData);

  // Define steps based on reward type selection
  const steps: Step[] = useMemo(() => {
    const baseSteps: Step[] = [
      {
        title: "General Information",
        description: "Let's start with the basics of your referral campaign",
        component: GeneralStep,
      },
      {
        title: "Reward Type",
        description: "Choose who gets rewarded and what type of rewards",
        component: RewardTypeStep,
      },
    ];

    // Add reward steps based on reward type
    if (
      campaignData.reward_strategy_type === "double-sided" ||
      campaignData.reward_strategy_type === "referrer-only"
    ) {
      baseSteps.push({
        title: "Referrer Rewards",
        description: "Define rewards for people who refer others",
        component: ReferrerRewardStep,
      });
    }

    if (
      campaignData.reward_strategy_type === "double-sided" ||
      campaignData.reward_strategy_type === "invitee-only"
    ) {
      baseSteps.push({
        title: "Invitee Rewards",
        description: "Define rewards for people who join through referrals",
        component: InviteeRewardStep,
      });
    }

    // Add remaining steps
    return [
      ...baseSteps,
      {
        title: "Goals",
        description: "Create engagement goals for your referral campaign",
        component: GoalsStep,
      },
      {
        title: "Conversion Value",
        description: "Set the value of conversions for your campaign",
        component: ConversionStep,
      },
      {
        title: "Security Settings",
        description: "Configure privacy and security options",
        component: SecurityStep,
      },
      {
        title: "Launch Settings",
        description: "Review and launch your campaign",
        component: FinalStep,
      },
    ];
  }, [campaignData.reward_strategy_type]);

  const updateData = (
    newData: Partial<Platform.WEST.Referral.Wizard.CampaignData>
  ) => {
    setCampaignData((prev) => ({ ...prev, ...newData }));
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
      window.scrollTo(0, 0);
    } else {
      onComplete(campaignData);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      window.scrollTo(0, 0);
    }
  };

  const CurrentStepComponent = steps[currentStep].component;

  return (
    <div className="rounded-lg shadow-md">
      <div className="p-6">
        <CurrentStepComponent data={campaignData} updateData={updateData} />
      </div>

      <WizardNav
        currentStep={currentStep}
        totalSteps={steps.length}
        onNext={handleNext}
        onBack={handleBack}
        isLastStep={currentStep === steps.length - 1}
      />
    </div>
  );
}
