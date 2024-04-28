import React from "react";
import i18next from "i18next";
import Link from "next/link";
import { CheckIcon } from "@radix-ui/react-icons";
import { client } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { EndingPage } from "@/theme/templates/formcomplete";
import { ssr_page_init_i18n } from "../../i18n";

export default async function SubmitCompletePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: {
    // response id
    rid: string;
  };
}) {
  const form_id = params.id;
  const response_id = searchParams.rid;

  const { data, error } = await client
    .from("form")
    .select(
      `
        *,
        default_page:form_page!default_form_page_id(
          *
        )
      `
    )
    .eq("id", form_id)
    .single();

  const { data: response } = await client
    .from("response")
    .select("*")
    .eq("id", response_id)
    .single();

  if (!data || !response) {
    return notFound();
  }

  await ssr_page_init_i18n({ lng: data.default_form_page_language });

  const { title, ending_page_template_id } = data;
  const { local_id } = response;

  if (!ending_page_template_id) {
    return (
      <main className="flex flex-col items-center justify-center h-screen">
        <div className="bg-white dark:bg-gray-900 shadow-lg rounded-lg p-8 max-w-md w-full">
          <div className="flex flex-col items-center space-y-4">
            <div className="bg-green-500 text-white rounded-full p-3">
              <CheckIcon className="h-6 w-6" />
            </div>

            <h1 className="text-3xl font-bold">{title}</h1>
            <p className="text-gray-500 dark:text-gray-400 text-center">
              {i18next.t("formcomplete.description")}
            </p>
            <Link
              className="inline-flex items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-gray-50 shadow transition-colors hover:bg-gray-900/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950 disabled:pointer-events-none disabled:opacity-50 dark:bg-gray-50 dark:text-gray-900 dark:hover:bg-gray-50/90 dark:focus-visible:ring-gray-300"
              href="#"
            >
              Return to Home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <EndingPage
      template_id={ending_page_template_id}
      data={{
        form_title: title,
        response_local_id: local_id,
      }}
    />
  );
}
