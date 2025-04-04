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

type RewardType = "double-sided" | "referrer-only" | "invitee-only";
type RewardCurrencyType =
  | "virtual-currency"
  | "draw-ticket"
  | "discount"
  | "custom";

type CampaignData = {
  name: string;
  description: string;
  reward_strategy_type: RewardType;
  reward_currency_type: RewardCurrencyType;
  reward_currency: string;
  max_invitations_per_referrer: number | null;
  referrer_milestone_rewards: Array<{
    threshold: number;
    description: string;
    value: number;
  }>;
  invitee_onboarding_reward: {
    description: string;
    value: number;
  };
  __prefers_builtin_platform: boolean;
  __prefers_offline_manual: boolean;
  challenges: Array<{
    index: number;
    event_id: string;
    description: string;
    depends_on: string | null;
  }>;
  conversion_currency: string;
  conversion_value: number | null;
  is_referrer_name_exposed_to_public_dangerously: boolean;
  is_invitee_name_exposed_to_public_dangerously: boolean;
  enabled: boolean;
  scheduling: {
    startNow: boolean;
    openAt: Date | null;
    closeAt: Date | null;
    timezone: string | null;
  };
};

const initialData: CampaignData = {
  name: "",
  description: "",
  reward_strategy_type: "double-sided",
  reward_currency_type: "virtual-currency",
  reward_currency: "XTS",
  max_invitations_per_referrer: null,
  referrer_milestone_rewards: [{ threshold: 1, description: "", value: 0 }],
  invitee_onboarding_reward: { description: "", value: 0 },
  __prefers_builtin_platform: true,
  __prefers_offline_manual: false,
  challenges: [],
  conversion_currency: "XTS",
  conversion_value: null,
  is_referrer_name_exposed_to_public_dangerously: false,
  is_invitee_name_exposed_to_public_dangerously: false,
  enabled: true,
  scheduling: {
    startNow: true,
    openAt: null,
    closeAt: null,
    timezone: null,
  },
};

type Step = {
  title: string;
  description: string;
  component: React.ComponentType<{
    data: CampaignData;
    updateData: (data: Partial<CampaignData>) => void;
  }>;
};

interface CampaignWizardProps {
  onComplete: (data: CampaignData) => void;
}

export function CampaignWizard({ onComplete }: CampaignWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [campaignData, setCampaignData] = useState<CampaignData>(initialData);

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

  const updateData = (newData: Partial<CampaignData>) => {
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
