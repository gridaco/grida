import React from "react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import Link from "next/link";
import i18next from "i18next";
import { ssr_page_init_i18n } from "../../i18n";

export default async function FormSoldoutPage({
  params,
}: {
  params: { id: string };
}) {
  const form_id = params.id;
  await ssr_page_init_i18n({ form_id });

  return (
    <main className="flex items-center justify-center w-screen h-screen">
      <Card className="w-full max-w-md p-4">
        <CardHeader className="flex flex-col items-center">
          <h2 className="text-lg font-bold tracking-tight">
            {i18next.t("formsoldout.default.title")}
          </h2>
          <p className="text-sm text-center text-gray-500">
            {i18next.t("formsoldout.default.description")}
          </p>
        </CardHeader>
        <CardContent className="p-0" />
        <CardFooter className="flex w-full p-0">
          <Link
            className="flex items-center justify-center w-full p-4 text-sm font-medium text-white bg-blue-600 rounded-b"
            href="#"
          >
            Home
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}
