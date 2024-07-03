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
import type { FormLinkURLParams } from "@/lib/forms/url";

export default async function AlreadyRespondedPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: FormLinkURLParams["alreadyresponded"];
}) {
  const form_id = params.id;
  const { fingerprint, customer_id, session_id } = searchParams || {};
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
              <article className="text-start prose prose-sm dark:prose-invert">
                <small>
                  <strong>{i18next.t("support_metadata")}</strong>
                </small>
                <br />
                <small>{i18next.t("support_metadata_no_share")}</small>
                <br />
                <ul>
                  <li>
                    fid: <code>{form_id}</code>
                  </li>
                  <li>
                    cid: <code>{customer_id}</code>
                  </li>
                  <li>
                    sid: <code>{session_id}</code>
                  </li>
                  <li>
                    sig: <code>{fingerprint}</code>
                  </li>
                </ul>
              </article>
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
