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
import { TemplateVariables } from "@/lib/templating";

export default function FormCompletePageDefault(
  context: TemplateVariables.FormResponseContext
) {
  return (
    <Card className="w-full max-w-md p-4">
      <CardHeader className="flex flex-col items-center">
        <CheckIcon className="w-12 h-12 my-4" />
        <h1
          className="text-lg text-center font-bold tracking-tight"
          dangerouslySetInnerHTML={{
            __html: i18next.t("formcomplete.default.h1", { ...context }),
          }}
        />
        <p
          className="text-sm text-center text-muted-foreground"
          dangerouslySetInnerHTML={{
            __html: i18next.t("formcomplete.default.p", { ...context }),
          }}
        />
      </CardHeader>
      <CardContent className="p-0" />
      <CardFooter className="flex w-full p-0">
        <Link className="w-full" href="#">
          <Button className="w-full">{i18next.t("home")}</Button>
        </Link>
      </CardFooter>
    </Card>
  );
}
