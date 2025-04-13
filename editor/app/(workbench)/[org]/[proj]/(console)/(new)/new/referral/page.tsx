"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { CampaignWizard } from "./campaign-wizard";
import { useProject } from "@/scaffolds/workspace";
import { Platform } from "@/lib/platform";
import toast from "react-hot-toast";
import WelcomeDialog from "./welcome-dialog";

export default function NewCampaignPage() {
  const [welcomOpen, setWelcomeOpen] = useState(true);
  const project = useProject();
  const router = useRouter();

  const handleComplete = async (
    campaignData: Platform.WEST.Referral.Wizard.CampaignData
  ) => {
    const task = fetch("/private/west/campaigns/new", {
      method: "POST",
      body: JSON.stringify(campaignData),
      headers: {
        "Content-Type": "application/json",
        "x-grida-editor-user-current-project-id": project.id.toString(),
      },
    })
      .then(async (res) => {
        if (res.ok) {
          return res.json() as Promise<{
            data: Platform.WEST.Referral.Campaign;
            error: null;
          }>;
        } else {
          throw new Error(res.statusText);
        }
      })
      .then(({ data }) => {
        router.replace(
          `/${project.organization_name}/${project.name}/campaigns/${data.id}`
        );
      })
      .catch((err) => {
        throw err;
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
