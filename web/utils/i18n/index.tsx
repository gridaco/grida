import { serverSideTranslations } from "next-i18next/serverSideTranslations";

export async function getPageTranslations(locale: string, page?: string) {
  return await serverSideTranslations(
    locale,
    [
      //
      "common",
      "header",
      "footer",
      page ? `page-${page}` : undefined,
    ].filter(Boolean),
  );
}
