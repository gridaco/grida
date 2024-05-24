import { Card, CardContent, CardHeader } from "@/components/ui/card";
import i18next from "i18next";
import { TemplateVariables } from "@/lib/templating";

export default function FormCompletePageTemplate_receipt01(
  context: TemplateVariables.FormResponseContext
) {
  return (
    <Component
      h1={i18next.t("formcomplete.receipt01.h1", { ...context })}
      h2={i18next.t("formcomplete.receipt01.h2", { ...context })}
      p={i18next.t("formcomplete.receipt01.p", { ...context })}
    />
  );
}

export function Component({
  h1,
  h2,
  p,
}: {
  h1: string;
  h2: string;
  p: string;
}) {
  return (
    <Card className="w-full max-w-md p-4">
      <CardHeader className="flex flex-col items-center">
        <h1
          className="text-5xl text-center font-black text-accent-foreground mb-4"
          dangerouslySetInnerHTML={{
            __html: h1,
          }}
        />
        <h2
          className="text-lg text-center font-bold tracking-tight"
          dangerouslySetInnerHTML={{
            __html: h2,
          }}
        />
        <p
          className="text-sm text-center text-gray-500"
          dangerouslySetInnerHTML={{
            __html: p,
          }}
        ></p>
      </CardHeader>
      <CardContent className="p-0" />
    </Card>
  );
}
