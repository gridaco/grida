import React from "react";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FORM_CLOSED_WHILE_RESPONDING } from "@/k/error";
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
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-col items-center text-center">
          {/* TODO: need translation for FORM_SCHEDULE_NOT_IN_RANGE */}
          {oops === FORM_CLOSED_WHILE_RESPONDING.code ? (
            <>
              <CardTitle className="text-lg font-bold tracking-tight">
                {i18next.t("formclosed.while_responding.title")}
              </CardTitle>
              <CardDescription>
                {i18next.t("formclosed.while_responding.description")}
              </CardDescription>
            </>
          ) : (
            <>
              <CardTitle className="text-lg font-bold tracking-tight">
                {i18next.t("formclosed.default.title")}
              </CardTitle>
              <CardDescription>
                {i18next.t("formclosed.default.description")}
              </CardDescription>
            </>
          )}
        </CardHeader>
        <CardFooter className="flex w-full">
          <Link className="w-full" href="#">
            <Button className="w-full">{i18next.t("home")}</Button>
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}
