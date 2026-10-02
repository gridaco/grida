import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@app/ui/components/card";
import { Button } from "@app/ui/components/button";
import Link from "next/link";
import { ssr_page_init_i18n } from "@/i18n/ssr";

type Params = { id: string };

export default async function BadRequestPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id: form_id } = await params;
  const t = await ssr_page_init_i18n({ form_id });

  return (
    <main className="container mx-auto flex items-center justify-center w-dvw min-h-dvh">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-col items-center text-center">
          <CardTitle className="text-lg font-bold tracking-tight">
            {t("badrequest.default.title")}
          </CardTitle>
          <CardDescription>
            {t("badrequest.default.description")}
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex w-full">
          <Link className="w-full" href="#">
            <Button className="w-full">{t("home")}</Button>
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}
