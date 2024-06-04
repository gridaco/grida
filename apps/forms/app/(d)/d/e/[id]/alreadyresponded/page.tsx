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
import { InfoCircledIcon } from "@radix-ui/react-icons";

export default async function AlreadyRespondedPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: {
    fingerprint?: string;
    customer?: string;
  };
}) {
  const form_id = params.id;
  const { customer: customer_id } = searchParams || {};
  await ssr_page_init_i18n({ form_id });

  return (
    <main className="container mx-auto flex items-center justify-center w-screen h-screen">
      <Card className="w-full max-w-md p-4">
        <CardHeader className="flex flex-col items-center">
          <h2 className="text-lg text-center font-bold tracking-tight">
            {i18next.t("alreadyresponded.default.title")}
          </h2>
          <p className="text-sm text-center text-gray-500">
            {i18next.t("alreadyresponded.default.description")}
          </p>
          <details className="text-center text-gray-500">
            <summary className="list-none flex items-center justify-center">
              <InfoCircledIcon className="" />
            </summary>
            <div className="mt-2 border border-dashed rounded p-2">
              <p className="prose prose-sm dark:prose-invert">
                <span
                  dangerouslySetInnerHTML={{
                    __html: i18next.t("your_customer_id_is", {
                      customer: {
                        // FIXME: use short_id
                        short_id: customer_id,
                      },
                      interpolation: { escapeValue: false },
                    }),
                  }}
                />
              </p>
            </div>
          </details>
        </CardHeader>
        <CardFooter className="flex w-full p-0">
          <Link className="w-full" href="#">
            <Button className="w-full">{i18next.t("home")}</Button>
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}
