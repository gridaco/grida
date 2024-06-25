import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createRouteHandlerWorkspaceClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

export default async function OrganizationsSettingsProfilePage({
  params,
}: {
  params: {
    organization_name: string;
  };
}) {
  const organization_name = params.organization_name;
  const cookieStore = cookies();

  const supabase = createRouteHandlerWorkspaceClient(cookieStore);

  const { data, error } = await supabase
    .from("organization")
    .select()
    .eq("name", organization_name)
    .single();

  if (error) console.error(error);
  if (!data) {
    return notFound();
  }

  return (
    <main className="container mx-auto py-10">
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4 py-10">
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input disabled readOnly value={data.name} />
            </div>
            <div className="grid gap-2">
              <Label>Organization display name</Label>
              <Input
                name="display_name"
                placeholder="Organization display name"
              />
            </div>
            <div className="grid gap-2">
              <Label>Email (will be public)</Label>
              <Input type="email" name="email" placeholder="alice@acme.com" />
            </div>
            <div className="grid gap-2">
              <Label>Description</Label>
              <Input
                name="description"
                placeholder="Organization description"
              />
            </div>
            <div className="grid gap-2">
              <Label>URL</Label>
              <Input type="url" name="url" placeholder="https://acme.com" />
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
