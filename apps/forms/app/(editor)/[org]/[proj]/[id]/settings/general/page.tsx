import React from "react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import {
  Sector,
  SectorBlocks,
  SectorDescription,
  SectorHeader,
  SectorHeading,
} from "@/components/preferences";
import { createServerComponentClient } from "@/lib/supabase/server";
import { DeleteFormSection } from "@/scaffolds/settings/delete-form/delete-form-section";
import { AboutThisForm } from "@/scaffolds/settings/about-this-form";
import {
  MaxRespoonses,
  RestrictNumberOfResponseByCustomer,
} from "@/scaffolds/settings/response-preferences";
import { ClosingFormPreferences } from "@/scaffolds/settings/closing-preference";
import { SchedulingPreferences } from "@/scaffolds/settings/scheduling-preference";

export default async function FormGeneralSettingsPage({
  params,
}: {
  params: { id: string };
}) {
  const cookieStore = cookies();

  const form_id = params.id;

  const supabase = createServerComponentClient(cookieStore);

  const { data } = await supabase
    .from("form")
    .select()
    .eq("id", form_id)
    .single();

  if (!data) {
    return notFound();
  }

  const {
    max_form_responses_by_customer,
    is_max_form_responses_by_customer_enabled,
    max_form_responses_in_total,
    is_max_form_responses_in_total_enabled,
    is_force_closed,
    is_scheduling_enabled,
    scheduling_open_at,
    scheduling_close_at,
    scheduling_tz,
  } = data!;

  return (
    <main className="max-w-2xl mx-auto">
      <Sector>
        {/* <SectorHeader>
          <SectorHeading>General</SectorHeading>
        </SectorHeader> */}
        <AboutThisForm form_id={form_id} />
      </Sector>
      <Sector id="access">
        <SectorHeader>
          <SectorHeading>Access</SectorHeading>
          <SectorDescription>
            Manage how responses are collected and protected
          </SectorDescription>
        </SectorHeader>
        <SectorBlocks>
          <ClosingFormPreferences
            form_id={form_id}
            init={{
              is_force_closed,
            }}
          />
          <SchedulingPreferences
            form_id={form_id}
            init={{
              is_scheduling_enabled,
              scheduling_open_at,
              scheduling_close_at,
              scheduling_tz,
            }}
          />
          <RestrictNumberOfResponseByCustomer
            form_id={form_id}
            init={{
              is_max_form_responses_by_customer_enabled,
              max_form_responses_by_customer,
            }}
          />
          <MaxRespoonses
            form_id={form_id}
            init={{
              is_max_form_responses_in_total_enabled,
              max_form_responses_in_total,
            }}
          />
        </SectorBlocks>
      </Sector>
      <Sector>
        <SectorHeader>
          <SectorHeading className="text-destructive">
            Danger Zone
          </SectorHeading>
        </SectorHeader>
        <DeleteFormSection />
      </Sector>
    </main>
  );
}
