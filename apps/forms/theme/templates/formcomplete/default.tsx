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

export default function FormCompletePageDefault({
  form_title,
}: {
  form_title: string;
}) {
  return (
    <main className="container mx-auto flex items-center justify-center w-screen h-screen">
      <Card className="w-full max-w-md p-4">
        <CardHeader className="flex flex-col items-center">
          <CheckIcon className="w-12 h-12 my-4" />
          <h2 className="text-lg text-center font-bold tracking-tight">
            {form_title}
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
