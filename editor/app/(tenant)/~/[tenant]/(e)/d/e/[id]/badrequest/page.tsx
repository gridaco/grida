import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import i18next from "i18next";
import { ssr_page_init_i18n } from "@/i18n/ssr";

type Params = { id: string };

export default async function BadRequestPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id: form_id } = await params;
  await ssr_page_init_i18n({ form_id });

  return (
    <main className="container mx-auto flex items-center justify-center w-dvw min-h-dvh">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-col items-center text-center">
          <CardTitle className="text-lg font-bold tracking-tight">
            {i18next.t("badrequest.default.title")}
          </CardTitle>
          <CardDescription>
            {i18next.t("badrequest.default.description")}
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex w-full">
          <Link className="w-full" href="#">
            <Button className="w-full">{i18next.t("home")}</Button>
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}
