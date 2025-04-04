"use client";
import { useRouter } from "next/navigation";
import { CampaignWizard } from "./campaign-wizard";

export default function NewCampaignPage() {
  const router = useRouter();

  const handleComplete = async (campaignData: any) => {
    console.log("Campaign created:", campaignData);
    alert("TODO: !");
  };

  return (
    <div className="container max-w-4xl py-8">
      {/* <h1 className="text-3xl font-bold mb-8">
        Create a New Referral Campaign
      </h1> */}
      <CampaignWizard onComplete={handleComplete} />
    </div>
  );
}
