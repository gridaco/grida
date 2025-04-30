"use client";

import { Badge } from "@/components/ui/badge";
import Overview from "./_components/overview";
import { useCampaign } from "./store";

type Params = {
  org: string;
  proj: string;
  campaign: string;
};

export default function CampaignsPage({ params }: { params: Params }) {
  const campaign = useCampaign();
  return (
    <main className="container mx-auto my-10">
      <div className="w-full h-full">
        <header className="flex items-center gap-4 border-b py-4 mb-4">
          <h1 className="text-2xl font-bold tracking-tight">
            {campaign.title}
          </h1>
          <Badge variant="outline">referral</Badge>
        </header>
        <Overview />
      </div>
    </main>
  );
}
