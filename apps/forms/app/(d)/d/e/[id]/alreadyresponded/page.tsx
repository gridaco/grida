import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import Link from "next/link";
import i18next from "i18next";

export default function AlreadyRespondedPage() {
  return (
    <main className="flex items-center justify-center w-screen h-screen">
      <Card className="w-full max-w-md p-4">
        <CardHeader className="flex flex-col items-center">
          <h2 className="text-lg font-bold tracking-tight">
            {i18next.t("alreadyresponded.default.title")}
          </h2>
          <p className="text-sm text-center text-gray-500">
            {i18next.t("alreadyresponded.default.description")}
          </p>
        </CardHeader>
        <CardContent className="p-0" />
        <CardFooter className="flex w-full p-0">
          <Link
            className="flex items-center justify-center w-full p-4 text-sm font-medium text-white bg-blue-600 rounded-b"
            href="#"
          >
            {i18next.t("home")}
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}
