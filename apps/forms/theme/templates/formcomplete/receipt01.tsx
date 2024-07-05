import { Card, CardContent, CardHeader } from "@/components/ui/card";
import i18next from "i18next";
import { TemplateVariables } from "@/lib/templating";
import { getPropTypes, getRenderedTexts } from "@/lib/templating/template";
import resources from "@/i18n";
import { render } from "@/lib/templating/template";

export default function FormCompletePageTemplate_receipt01({
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
        basePath: `formcomplete.receipt01`,
      },
      renderer: render,
      merge: false,
    },
  });

  return <Component h1={texts.h1} h2={texts.h2} p={texts.p} />;
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
        <h1 // h1
          className="text-5xl text-center font-black mb-4"
          dangerouslySetInnerHTML={{
            __html: h1,
          }}
        />
        <h2 // h2
          className="text-lg text-center font-bold tracking-tight"
          dangerouslySetInnerHTML={{
            __html: h2,
          }}
        />
        <span // p
          className="text-sm text-center text-gray-500"
          dangerouslySetInnerHTML={{
            __html: p,
          }}
        />
      </CardHeader>
      <CardContent className="p-0" />
    </Card>
  );
}
