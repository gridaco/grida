import React from "react";
import { createRouteHandlerWorkspaceClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { PublicUrls } from "@/services/public-urls";
import MemberList, { MemberItem } from "./list";

type Params = { organization_name: string };

export default async function PoeplesPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { organization_name } = await params;
  const cookieStore = await cookies();
  const supabase = createRouteHandlerWorkspaceClient(cookieStore);
  const avatar_url = PublicUrls.organization_avatar_url(supabase);
  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) {
    return redirect("/sign-in");
  }

  const { data, error } = await supabase
    .from("organization")
    .select(
      `
      *,
      members:organization_member(
        *,
        profile:user_profile(*)
      )`
    )
    .eq("name", organization_name)
    .single();

  if (error) console.error(error);
  if (!data) {
    return notFound();
  }

  const iamowner = data.owner_id === auth.user.id;

  const members = data.members.map(
    (member) =>
      ({
        id: member.id,
        display_name: member.profile.display_name,
        avatar_url: member.profile.avatar_path
          ? (avatar_url(member.profile.avatar_path) ?? undefined)
          : undefined,
        role: member.user_id === data.owner_id ? "owner" : "member",
      }) satisfies MemberItem
  );

  return (
    <main className="container mx-auto max-w-screen-md mt-20 mb-40 grid gap-40">
      {/*  */}
      <h1 className="text-2xl font-bold mb-5">{data.display_name} Members</h1>
      <MemberList members={members} canEdit={iamowner} />
    </main>
  );
}
