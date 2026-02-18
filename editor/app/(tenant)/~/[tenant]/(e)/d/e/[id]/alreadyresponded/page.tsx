import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import i18next from "i18next";
import { ssr_page_init_i18n } from "@/i18n/ssr";
import { InfoCircledIcon } from "@radix-ui/react-icons";
import type { FormLinkURLParams } from "@/host/url";

type Params = { id: string };

export default async function AlreadyRespondedPage(props: {
  params: Promise<Params>;
  searchParams?: Promise<FormLinkURLParams["alreadyresponded"]>;
}) {
  const searchParams = await props.searchParams;
  const { id: form_id } = await props.params;
  const { fingerprint, customer_id, session_id } = searchParams || {};
  await ssr_page_init_i18n({ form_id });

  return (
    <main className="container mx-auto flex items-center justify-center w-dvw min-h-dvh">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-col items-center text-center">
          <CardTitle className="text-lg font-bold tracking-tight">
            {i18next.t("alreadyresponded.default.title")}
          </CardTitle>
          <CardDescription>
            {i18next.t("alreadyresponded.default.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <details className="text-center text-muted-foreground">
            <summary className="list-none flex items-center justify-center cursor-pointer">
              <InfoCircledIcon className="" />
            </summary>
            <div className="mt-2 border border-dashed rounded-sm p-2">
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
        </CardContent>
        <CardFooter className="flex w-full">
          <Link className="w-full" href="#">
            <Button className="w-full">{i18next.t("home")}</Button>
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}
