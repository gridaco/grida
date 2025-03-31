"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TokensTable } from "./tokens-table";
import { ParticipantsTable } from "./participants-table";
import { QuestsTable } from "./quests-table";
import LogsTable from "./logs-table";
import CampaignSettings from "./settings";
import Overview from "./overview";

type Params = {
  org: string;
  proj: string;
  campaign: string;
};

export default function CampaignsPage({ params }: { params: Params }) {
  const { campaign: campaign_id } = params;

  return (
    <main className="container mx-auto my-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Campaign</h1>
          <p className="text-muted-foreground">
            Track your marketing campaign performance in real-time
          </p>
        </div>
      </div>
      <Tabs defaultValue="overview" className="mt-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="participants">Participants</TabsTrigger>
          <TabsTrigger value="quests">Quests</TabsTrigger>
          <TabsTrigger value="tokens">Tokens</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <hr className="mt-2 mb-6" />
        <TabsContent value="overview">
          <Overview campaign_id={campaign_id} />
        </TabsContent>
        <TabsContent value="participants">
          <ParticipantsTable campaign_id={campaign_id} />
        </TabsContent>
        <TabsContent value="quests">
          <QuestsTable campaign_id={campaign_id} />
        </TabsContent>
        <TabsContent value="tokens">
          <TokensTable campaign_id={campaign_id} />
        </TabsContent>
        <TabsContent value="logs">
          <LogsTable campaign_id={campaign_id} />
        </TabsContent>
        <TabsContent value="settings">
          <CampaignSettings campaign_id={campaign_id} />
        </TabsContent>
      </Tabs>
    </main>
  );
}
