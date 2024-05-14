import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import i18next from "i18next";
import type { FormResponsePageTemplateProps } from "./types";

export default function FormCompletePageTemplate_receipt01({
  form_title,
  response_short_id,
}: FormResponsePageTemplateProps) {
  return (
    <main className="container mx-auto flex items-center justify-center w-screen h-screen">
      <Card className="w-full max-w-md p-4">
        <CardHeader className="flex flex-col items-center">
          <div className="text-5xl font-black text-blue-700 mb-4">
            {response_short_id}
          </div>
          <h2 className="text-lg text-center font-bold tracking-tight">
            {i18next.t("formcomplete.receipt01.title")} - {form_title}
          </h2>
          <p className="text-sm text-center text-gray-500">
            {i18next.t("formcomplete.receipt01.description")}
          </p>
        </CardHeader>
        <CardContent className="p-0" />
        {/* <CardFooter className="flex w-full p-0"></CardFooter> */}
      </Card>
    </main>
  );
}
