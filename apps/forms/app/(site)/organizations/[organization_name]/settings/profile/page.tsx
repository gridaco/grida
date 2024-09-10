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
import { createRouteHandlerWorkspaceClient } from "@/supabase/server";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { GridaLogo } from "@/components/grida-logo";
import { DeleteOrganizationConfirm } from "./delete";
import { Badge } from "@/components/ui/badge";

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

  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) {
    return redirect("/sign-in");
  }

  const { data, error } = await supabase
    .from("organization")
    .select()
    .eq("name", organization_name)
    .single();

  if (error) console.error(error);
  if (!data) {
    return notFound();
  }

  const isowner = data.owner_id === auth.user.id;

  return (
    <main className="container mx-auto max-w-screen-md mt-20 mb-40 grid gap-40">
      <Nav org={organization_name} />
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            id="profile"
            action={`/private/accounts/organizations/${organization_name}/profile`}
            encType="multipart/form-data"
            method="POST"
            className="flex flex-col gap-10 py-4"
          >
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input disabled readOnly value={data.name} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="display_name">Organization display name</Label>
              <Input
                id="display_name"
                name="display_name"
                required
                placeholder="Organization display name"
                defaultValue={data.display_name ?? undefined}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email (will be public)</Label>
              <Input
                type="email"
                id="email"
                name="email"
                required
                placeholder="alice@acme.com"
                defaultValue={data.email ?? undefined}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                name="description"
                placeholder="Organization description"
                defaultValue={data.description ?? undefined}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="blog">URL</Label>
              <Input
                type="url"
                id="blog"
                name="blog"
                placeholder="https://acme.com"
                defaultValue={data.blog ?? undefined}
              />
            </div>
          </form>
        </CardContent>
        <CardFooter className="flex justify-end items-center border-t pt-6">
          <Button form="profile">Save</Button>
        </CardFooter>
      </Card>
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex justify-between items-center gap-10 py-4 border-y">
            <div className="grid gap-1">
              <span className="font-bold">
                Delete this organization
                <Badge variant="secondary" className="inline ms-2 align-middle">
                  owner
                </Badge>
              </span>
              <span>
                Once deleted, it will be gone forever. Please be certain.
              </span>
            </div>
            <DeleteOrganizationConfirm org={organization_name}>
              <Button disabled={!isowner} variant="destructive">
                Delete this organization
              </Button>
            </DeleteOrganizationConfirm>
          </form>
        </CardContent>
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
