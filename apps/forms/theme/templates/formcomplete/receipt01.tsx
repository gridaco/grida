import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import i18next from "i18next";
import { TemplateVariables } from "@/lib/templating";

export default function FormCompletePageTemplate_receipt01(
  context: TemplateVariables.FormResponseContext
) {
  return (
    <Card className="w-full max-w-md p-4">
      <CardHeader className="flex flex-col items-center">
        <div className="text-5xl font-black text-accent-foreground mb-4">
          {i18next.t("formcomplete.receipt01.h1", { ...context })}
        </div>
        <h2 className="text-lg text-center font-bold tracking-tight">
          {i18next.t("formcomplete.receipt01.h2", { ...context })}
        </h2>
        <p className="text-sm text-center text-gray-500">
          {i18next.t("formcomplete.receipt01.p", { ...context })}
        </p>
      </CardHeader>
      <CardContent className="p-0" />
      {/* <CardFooter className="flex w-full p-0"></CardFooter> */}
    </Card>
  );
}
