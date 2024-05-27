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
import { getPropTypes, getRenderedTexts } from "@/lib/templating/template";
import resources from "@/i18n";
import { render } from "@/lib/templating/template";

export default function FormCompletePageDefault({
  overrides,
  context,
}: {
  overrides?: Record<string, string>;
  context: TemplateVariables.FormResponseContext;
}) {
  const texts = getRenderedTexts({
    shape: getPropTypes(resources.en.translation.formcomplete.receipt01).shape,
    overrides,
    config: {
      context,
      i18n: {
        t: i18next.t,
        basePath: `formcomplete.default`,
      },
      renderer: render,
      merge: false,
    },
  });

  return (
    <Component
      h1={texts.h1}
      p={texts.p}
      button={texts.button}
      href={texts.href}
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
        <span // p
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
