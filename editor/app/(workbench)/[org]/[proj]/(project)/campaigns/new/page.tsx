"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { CampaignWizard } from "./campaign-wizard";
import { useProject } from "@/scaffolds/workspace";
import toast from "react-hot-toast";
import WelcomeDialog from "./welcome-dialog";

export default function NewCampaignPage() {
  const [welcomOpen, setWelcomeOpen] = useState(true);
  const project = useProject();
  const router = useRouter();

  const handleComplete = async (campaignData: any) => {
    console.log("creating campaign..", campaignData);
    const task = fetch("/private/west/campaigns/new", {
      method: "POST",
      body: JSON.stringify(campaignData),
      headers: {
        "Content-Type": "application/json",
        "x-grida-editor-user-current-project-id": project.id.toString(),
      },
    });

    task.then(async (res) => {
      const { data: new_campaign } = await res.json();
      if (res.ok) {
        router.push(`./${new_campaign.slug}`);
      }
    });

    toast.promise(task, {
      loading: "Creating campaign...",
      success: "Campaign created successfully!",
      error: "Failed to create campaign",
    });
  };

  return (
    <div className="container max-w-4xl py-8">
      {/* <h1 className="text-3xl font-bold mb-8">
        Create a New Referral Campaign
      </h1> */}
      <WelcomeDialog open={welcomOpen} onOpenChange={setWelcomeOpen} />
      <CampaignWizard onComplete={handleComplete} />
    </div>
  );
}
