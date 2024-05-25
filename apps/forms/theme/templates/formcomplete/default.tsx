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
    <Component
      h1={i18next.t("formcomplete.default.h1", { ...context })}
      p={i18next.t("formcomplete.default.p", { ...context })}
      button={i18next.t("formcomplete.default.button", { ...context })}
      href={i18next.t("formcomplete.default.href", { ...context })}
    />
  );
}

export function Component({
  h1,
  p,
  button,
  href,
}: {
  h1: string;
  p: string;
  button: string;
  href: string;
}) {
  return (
    <Card className="w-full max-w-md p-4">
      <CardHeader className="flex flex-col items-center">
        <CheckIcon className="w-12 h-12 my-4" />
        <h1
          className="text-lg text-center font-bold tracking-tight"
          dangerouslySetInnerHTML={{
            __html: h1,
          }}
        />
        <p
          className="text-sm text-center text-muted-foreground"
          dangerouslySetInnerHTML={{
            __html: p,
          }}
        />
      </CardHeader>
      <CardContent className="p-0" />
      <CardFooter className="flex w-full p-0">
        {href && (
          <Link className="w-full" href={href}>
            <Button
              className="w-full"
              dangerouslySetInnerHTML={{
                __html: button,
              }}
            />
          </Link>
        )}
      </CardFooter>
    </Card>
  );
}
