import React from "react";
import i18next from "i18next";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
    rid?: string;
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

  if (error || !data) {
    return notFound();
  }

  await ssr_page_init_i18n({ lng: data.default_form_page_language });

  const { title, ending_page_template_id } = data;

  if (!ending_page_template_id) {
    return (
      <main className="container mx-auto flex items-center justify-center w-screen h-screen">
        <Card className="w-full max-w-md p-4">
          <CardHeader className="flex flex-col items-center">
            <CheckIcon className="w-12 h-12 my-4" />
            <h2 className="text-lg text-center font-bold tracking-tight">
              {title}
            </h2>
            <p className="text-sm text-center text-gray-500">
              {i18next.t("formcomplete.default.description")}
            </p>
          </CardHeader>
          <CardContent className="p-0" />
          <CardFooter className="flex w-full p-0">
            <Link className="w-full" href="#">
              <Button className="w-full">{i18next.t("home")}</Button>
            </Link>
          </CardFooter>
        </Card>
      </main>
    );
  }

  if (!response_id) {
    return notFound();
  }

  const { data: response } = await client
    .from("response")
    .select("*")
    .eq("id", response_id)
    .single();

  if (!response) {
    return notFound();
  }

  const { local_id } = response;

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
