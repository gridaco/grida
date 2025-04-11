import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InvitationsTable } from "../_components/invitations-table";
import { ReferrersTable } from "../_components/referrers-table";

export default function Page() {
  return (
    <main className="container mx-auto my-10">
      <div className="w-full h-full">
        <header className="flex items-center gap-4 border-b py-4 mb-4">
          <h1 className="text-2xl font-bold tracking-tight">Participants</h1>
        </header>
        <Tabs defaultValue="referrers" className="mt-6">
          <TabsList>
            <TabsTrigger value="referrers">Referrers</TabsTrigger>
            <TabsTrigger value="invitations">Invitations</TabsTrigger>
          </TabsList>
          <hr className="mt-2 mb-6" />
          <TabsContent value="referrers">
            <ReferrersTable />
          </TabsContent>
          <TabsContent value="invitations">
            <InvitationsTable />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
