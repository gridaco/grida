import { Button } from "@app/ui/components/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@app/ui/components/card";
import { Field, FieldGroup, FieldLabel } from "@app/ui/components/field";
import { Input } from "@app/ui/components/input";
import { notFound, redirect } from "next/navigation";
import { DeleteOrganizationConfirm } from "./delete";
import { Badge } from "@app/ui/components/badge";
import { createClient } from "@/lib/supabase/server";
import { PublicUrls } from "@/services/public-urls";
import { updateOrganizationProfile } from "./actions";
import { OrganizationAvatarField } from "./avatar-field";
import Link from "next/link";

type Params = { organization_name: string };

export default async function OrganizationsSettingsProfilePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { organization_name } = await params;

  const client = await createClient();

  const { data: auth } = await client.auth.getUser();

  if (!auth.user) {
    return redirect("/sign-in");
  }

  const { data, error } = await client
    .from("organization")
    .select()
    .eq("name", organization_name)
    .single();

  if (error) console.error(error);
  if (!data) {
    return notFound();
  }

  const iamowner = data.owner_id === auth.user.id;

  const avatar_url = data.avatar_path
    ? PublicUrls.organization_avatar_url(client)(data.avatar_path)
    : null;

  return (
    <main className="container mx-auto max-w-screen-md py-10 grid gap-10">
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            id="profile"
            action={updateOrganizationProfile.bind(null, organization_name)}
            // Required so the picked avatar `File` is encoded into the request
            // and arrives as a `File` in the server action's `FormData`.
            encType="multipart/form-data"
            className="py-4"
          >
            <FieldGroup className="gap-10">
              <Field>
                <FieldLabel>Organization avatar</FieldLabel>
                <OrganizationAvatarField
                  current_avatar_url={avatar_url}
                  display_name={data.display_name}
                />
              </Field>
              <Field>
                <FieldLabel>Name</FieldLabel>
                <Input disabled readOnly value={data.name} />
              </Field>
              <Field>
                <FieldLabel htmlFor="display_name">
                  Organization display name
                </FieldLabel>
                <Input
                  id="display_name"
                  name="display_name"
                  required
                  placeholder="Organization display name"
                  defaultValue={data.display_name ?? undefined}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="email">Email (will be public)</FieldLabel>
                <Input
                  type="email"
                  id="email"
                  name="email"
                  required
                  placeholder="alice@acme.com"
                  defaultValue={data.email ?? undefined}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="description">Description</FieldLabel>
                <Input
                  id="description"
                  name="description"
                  placeholder="Organization description"
                  defaultValue={data.description ?? undefined}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="blog">URL</FieldLabel>
                <Input
                  type="url"
                  id="blog"
                  name="blog"
                  placeholder="https://acme.com"
                  defaultValue={data.blog ?? undefined}
                />
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
        <CardFooter className="flex justify-end items-center border-t pt-6">
          <Button form="profile">Save</Button>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
          <Link
            href={`/organizations/${organization_name}/people`}
            className="underline"
          >
            Manage members
          </Link>
        </CardContent>
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
              <Button disabled={!iamowner} variant="destructive">
                Delete this organization
              </Button>
            </DeleteOrganizationConfirm>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
