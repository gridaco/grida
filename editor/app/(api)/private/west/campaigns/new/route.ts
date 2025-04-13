import { Database } from "@/database.types";
import {
  createRouteHandlerWestReferralClient,
  createRouteHandlerWWWClient,
  workspaceclient,
} from "@/lib/supabase/server";
import assert from "assert";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { Platform } from "@/lib/platform";
import { notFound } from "next/navigation";
import { nanoid } from "nanoid";

export async function POST(req: Request) {
  const body = await req.json();
  const cookieStore = await cookies();
  const headerList = await headers();
  const client = createRouteHandlerWestReferralClient(cookieStore);
  const wwwclient = createRouteHandlerWWWClient(cookieStore);

  const project_id = Number(
    headerList.get("x-grida-editor-user-current-project-id")
  );

  assert(project_id);

  const { data: www, error: www_err } = await wwwclient
    .from("www")
    .select()
    .eq("project_id", project_id)
    .single();

  if (www_err) {
    console.error("err@pre", www_err, "for project", project_id);
    return notFound();
  }

  const {
    //
    title,
    description,
    conversion_currency,
    conversion_value,
    reward_currency,
    max_invitations_per_referrer,
    is_referrer_profile_exposed_to_public_dangerously,
    is_invitee_profile_exposed_to_public_dangerously,
    enabled,
    scheduling,
    //
    invitee_onboarding_reward,
    referrer_milestone_rewards,
    triggers,
    challenges,
  } = body as Platform.WEST.Referral.Wizard.CampaignData;

  // step document-1. create document
  const { data: base_doc, error: base_doc_err } = await workspaceclient
    .from("document")
    .insert({
      doctype: "v0_campaign_referral",
      project_id: project_id,
    })
    .select("id")
    .single();

  if (base_doc_err) {
    console.error("err@0", base_doc_err, "for project", project_id);
    return new NextResponse("failed to create campaign doc", { status: 500 });
  }

  // step www-1. create default www layout for the campaign
  const { data: layout, error: layout_err } = await wwwclient
    .from("layout")
    .insert({
      name: nanoid(8), // slug
      base_path: "/r",
      document_id: base_doc.id,
      document_type: "v0_campaign_referral",
      www_id: www.id,
    })
    .select()
    .single();

  if (layout_err) {
    console.error("err@layout", layout_err, "for www", www.id);
    return new NextResponse("failed to create campaign doc", { status: 500 });
  }

  // step campaign-1. create campaign
  const { data: new_campaign, error: new_campaign_err } = await client
    .from("campaign")
    .insert({
      id: base_doc.id,
      project_id: project_id,
      title: title,
      description: description,
      layout_id: layout.id,
      conversion_currency: conversion_currency,
      conversion_value: conversion_value,
      reward_currency: reward_currency,
      enabled: enabled,
      is_invitee_profile_exposed_to_public_dangerously:
        is_invitee_profile_exposed_to_public_dangerously,
      is_referrer_profile_exposed_to_public_dangerously:
        is_referrer_profile_exposed_to_public_dangerously,
      max_invitations_per_referrer: max_invitations_per_referrer,
      metadata: null,
      public: null,
      scheduling_open_at: scheduling.scheduling_open_at,
      scheduling_close_at: scheduling.scheduling_close_at,
      scheduling_tz: scheduling.scheduling_tz,
    })
    .select()
    .single();

  if (new_campaign_err) console.error("err@1", new_campaign_err, { body });
  if (!new_campaign)
    return new NextResponse("failed to create campaign", { status: 500 });

  const campaign_id = new_campaign.id;

  // step campaign-2. seed wellknown events
  const { data: wellknown_events, error: err_at_2 } = await client
    .from("campaign_wellknown_event")
    .insert(
      triggers.map(
        (trigger) =>
          ({
            campaign_id,
            name: trigger.name,
            description: trigger.description,
          }) satisfies Database["grida_west_referral"]["Tables"]["campaign_wellknown_event"]["Insert"]
      )
    )
    .select();

  const wellknown_events_name_to_id = wellknown_events
    ? Object.fromEntries(
        wellknown_events.map((event) => [event.name, event.id])
      )
    : {};

  // step campaign-3. create onboarding challenges
  const mapped_challenges = challenges.map((challenge, i) => {
    const trigger_id = wellknown_events_name_to_id[challenge.trigger_name];
    return {
      campaign_id: campaign_id,
      index: i,
      event_id: trigger_id,
      // TODO:
      depends_on: null,
    } satisfies Database["grida_west_referral"]["Tables"]["campaign_challenge"]["Insert"];
  });

  const { error: err_at_3 } = await client
    .from("campaign_challenge")
    .insert(mapped_challenges)
    .select();

  // step campaign-4. create milestones
  const { error: err_at_4 } = await client
    .from("campaign_referrer_milestone_reward")
    .insert(
      referrer_milestone_rewards.map(
        (milestone: any) =>
          ({
            campaign_id: campaign_id,
            threshold_count: milestone.threshold,
            reward_description: milestone.description,
            reward_value: milestone.value,
          }) satisfies Database["grida_west_referral"]["Tables"]["campaign_referrer_milestone_reward"]["Insert"]
      )
    )
    .select();

  // step campaign-5. create onboarding rewards
  const { error: err_at_5 } = await client
    .from("campaign_invitee_onboarding_reward")
    .insert({
      campaign_id: campaign_id,
      reward_description: invitee_onboarding_reward.description,
      reward_value: invitee_onboarding_reward.value,
    })
    .select();

  if (err_at_2 || err_at_3 || err_at_4 || err_at_5) {
    console.log(
      "error after creating campaign",
      {
        err_at_2,
        err_at_3,
        err_at_4,
        err_at_5,
      },
      "trying to rollback"
    );

    // rollback
    const { count, error: rollback_err } = await client
      .from("campaign")
      .delete({ count: "exact" })
      .eq("id", campaign_id)
      .select();

    // this is a rollback. if rollback fails, we just log and continue; (it should return ok with what is available)
    if (rollback_err)
      console.error("rollback failed - ignore and continue", rollback_err);
    // if the rollback, success, we return 500
    if (count === 1) {
      return new NextResponse("failed to create campaign", { status: 500 });
    }
  }

  console.log("new_campaign", new_campaign);

  return NextResponse.json(
    {
      data: { ...new_campaign },
      error: null,
    },
    { status: 200 }
  );
}
