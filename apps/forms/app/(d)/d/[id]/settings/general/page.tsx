import { createServerComponentClient } from "@/lib/supabase/server";
import { UnknownFieldPreferences } from "@/scaffolds/settings/data-unknown-fields";
import { DeleteFormSection } from "@/scaffolds/settings/delete-form/delete-form-section";
import { RedirectPreferences } from "@/scaffolds/settings/redirect-section";
import { TrustedOriginPreferences } from "@/scaffolds/settings/trusted-origins";
import {
  MaxRespoonses,
  RestrictNumberOfResponseByCustomer,
} from "@/scaffolds/settings/response-preference-section";
import { cookies } from "next/headers";
import React from "react";
import {
  Sector,
  SectorBlocks,
  SectorDescription,
  SectorHeader,
  SectorHeading,
} from "@/components/preferences";
import { notFound } from "next/navigation";

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
    unknown_field_handling_strategy,
    redirect_after_response_uri,
    is_redirect_after_response_uri_enabled,
    max_form_responses_by_customer,
    is_max_form_responses_by_customer_enabled,
    max_form_responses_in_total,
    is_max_form_responses_in_total_enabled,
  } = data!;

  return (
    <main className="max-w-2xl mx-auto">
      <Sector>
        <SectorHeader>
          <SectorHeading>Data Integrity</SectorHeading>
        </SectorHeader>
        <UnknownFieldPreferences
          form_id={form_id}
          init={{
            unknown_field_handling_strategy,
          }}
        />
      </Sector>
      <Sector>
        <SectorHeader>
          <SectorHeading>Responses</SectorHeading>
          <SectorDescription>
            Manage how responses are collected and protected
          </SectorDescription>
        </SectorHeader>
        <SectorBlocks>
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
          <SectorHeading>Redirection</SectorHeading>
          <SectorDescription>
            Customize redirection url after submission
          </SectorDescription>
        </SectorHeader>
        <RedirectPreferences
          form_id={form_id}
          init={{
            is_redirect_after_response_uri_enabled:
              is_redirect_after_response_uri_enabled,
            redirect_after_response_uri: redirect_after_response_uri ?? "",
          }}
        />
      </Sector>
      <Sector>
        <SectorHeader>
          <SectorHeading>Security</SectorHeading>
          <SectorDescription>
            Configure where the form can be embedded
          </SectorDescription>
        </SectorHeader>
        <TrustedOriginPreferences />
      </Sector>
      <Sector>
        <SectorHeader>
          <SectorHeading>Delete Form</SectorHeading>
        </SectorHeader>
        <DeleteFormSection />
      </Sector>
    </main>
  );
}
