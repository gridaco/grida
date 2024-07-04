import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createRouteHandlerWorkspaceClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { GridaLogo } from "@/components/grida-logo";

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
    <main className="container mx-auto max-w-screen-md mt-20">
      <Nav org={organization_name} />
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-10 py-4">
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
              <Input
                type="email"
                name="email"
                placeholder="alice@acme.com"
                defaultValue={data.email ?? undefined}
              />
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
        <CardFooter className="flex justify-end items-center border-t pt-6">
          <Button>Save</Button>
        </CardFooter>
      </Card>
    </main>
  );
}

function Nav({ org }: { org: string }) {
  return (
    <header className="fixed top-0 left-0 right-0 w-full p-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <Link href="/">
              <GridaLogo className="w-4 h-4" />
            </Link>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <Link href="/organizations">organizations</Link>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <Link href={`/organizations/${org}`}>{org}</Link>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <Link href={`/organizations/${org}/settings`}>settings</Link>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>profile</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>
      <nav></nav>
    </header>
  );
}
