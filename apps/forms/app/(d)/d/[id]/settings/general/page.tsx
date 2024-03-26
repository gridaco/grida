import { createServerComponentClient } from "@/lib/supabase/server";
import { UnknownFieldPreferences } from "@/scaffolds/settings/data-unknown-fields";
import { DeleteFormSection } from "@/scaffolds/settings/delete-form/delete-form-section";
import { RedirectPreferences } from "@/scaffolds/settings/redirect-section";
import { TrustedOriginPreferences } from "@/scaffolds/settings/redirect-section copy";
import { ResponsePreferences } from "@/scaffolds/settings/response-preference-section";
import { cookies } from "next/headers";
import React from "react";

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

  const { redirect_after_response_uri } = data!;

  return (
    <main className="max-w-2xl mx-auto">
      <Sector>
        <SectorHeader>
          <SectorHeading>Data Integrity</SectorHeading>
        </SectorHeader>
        <UnknownFieldPreferences />
      </Sector>
      <Sector>
        <SectorHeader>
          <SectorHeading>Responses</SectorHeading>
          <SectorDescription>
            Manage how responses are collected and protected
          </SectorDescription>
        </SectorHeader>
        <ResponsePreferences />
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
          defaultValue={redirect_after_response_uri ?? ""}
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

function Sector({ children }: React.PropsWithChildren<{}>) {
  return <section className="py-5">{children}</section>;
}

function SectorHeader({ children }: React.PropsWithChildren<{}>) {
  return <header className="flex flex-col gap-1 mb-4">{children}</header>;
}

function SectorHeading({ children }: React.PropsWithChildren<{}>) {
  return <h1 className="text-2xl font-bold py-2">{children}</h1>;
}

function SectorDescription({ children }: React.PropsWithChildren<{}>) {
  return <span className="text-sm opacity-50">{children}</span>;
}
