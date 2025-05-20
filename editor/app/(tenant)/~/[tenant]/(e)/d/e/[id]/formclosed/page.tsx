import React from "react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FORM_CLOSED_WHILE_RESPONDING,
  FORM_SCHEDULE_NOT_IN_RANGE,
} from "@/k/error";
import Link from "next/link";
import i18next from "i18next";
import { ssr_page_init_i18n } from "@/i18n/ssr";
import type { FormLinkURLParams } from "@/host/url";

type Params = { id: string };

export default async function FormClosedPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<FormLinkURLParams["formclosed"]>;
}) {
  const { id: form_id } = await params;
  const { oops } = await searchParams;
  await ssr_page_init_i18n({ form_id });

  return (
    <main className="container mx-auto flex items-center justify-center w-dvw min-h-dvh">
      <Card className="w-full max-w-md p-4">
        <CardHeader className="flex flex-col items-center">
          {/* TODO: need translation for FORM_SCHEDULE_NOT_IN_RANGE */}

          {oops === FORM_CLOSED_WHILE_RESPONDING.code ? (
            <>
              <h2 className="text-lg text-center font-bold tracking-tight">
                {i18next.t("formclosed.while_responding.title")}
              </h2>
              <p className="text-sm text-center text-gray-500">
                {i18next.t("formclosed.while_responding.description")}
              </p>
            </>
          ) : (
            <>
              <h2 className="text-lg text-center font-bold tracking-tight">
                {i18next.t("formclosed.default.title")}
              </h2>
              <p className="text-sm text-center text-gray-500">
                {i18next.t("formclosed.default.description")}
              </p>
            </>
          )}
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
