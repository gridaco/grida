"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InvitationsTable } from "./invitations-table";
import { ReferrersTable } from "./referrers-table";
import { QuestsTable } from "./quests-table";
import LogsTable from "./logs-table";
import CampaignSettings from "./settings";
import Overview from "./overview";
import { Badge } from "@/components/ui/badge";
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{campaign.name}</h1>
          <p className="text-muted-foreground">
            Track your marketing campaign performance in real-time
          </p>
          <Badge variant="outline">referral</Badge>
        </div>
      </div>
      <Tabs defaultValue="overview" className="mt-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="quests">Quests</TabsTrigger>
          <TabsTrigger value="referres">Referrers</TabsTrigger>
          <TabsTrigger value="invitations">Invitations</TabsTrigger>
          <TabsTrigger value="rewards">Rewards</TabsTrigger>
          <TabsTrigger value="logs">Observability</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <hr className="mt-2 mb-6" />
        <TabsContent value="overview">
          <Overview />
        </TabsContent>
        <TabsContent value="referres">
          <ReferrersTable />
        </TabsContent>
        <TabsContent value="quests">
          <QuestsTable />
        </TabsContent>
        <TabsContent value="invitations">
          <InvitationsTable />
        </TabsContent>
        <TabsContent value="logs">
          <LogsTable />
        </TabsContent>
        <TabsContent value="settings">
          <CampaignSettings />
        </TabsContent>
      </Tabs>
    </main>
  );
}
