import React from "react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import i18next from "i18next";
import { ssr_page_init_i18n } from "@/i18n/ssr";

type Params = { id: string };

export default async function FormOptionSoldoutPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id: form_id } = await params;
  await ssr_page_init_i18n({ form_id });

  return (
    <main className="container mx-auto flex items-center justify-center w-screen h-screen">
      <Card className="w-full max-w-md p-4">
        <CardHeader className="flex flex-col items-center">
          <h2 className="text-lg text-center font-bold tracking-tight">
            {i18next.t("formoptionsoldout.default.title")}
          </h2>
          <p className="text-sm text-center text-gray-500">
            {i18next.t("formoptionsoldout.default.description")}
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
