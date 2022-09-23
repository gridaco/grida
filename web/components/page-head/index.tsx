import React from "react";
import Head from "next/head";
import { useTranslation } from "next-i18next";
import { PageSeoMeta, keywords as makekeywords } from "utils/seo";
import { i18n as config } from "../../next-i18next.config";

type PageHeadProps =
  | {
      type: "id";
      page: string;
    }
  | ({
      type: "data";
    } & PageSeoMeta);

export default function PageHead({
  type,
  children,
  ...props
}: React.PropsWithChildren<PageHeadProps>) {
  switch (type) {
    case "id": {
      const { page } = props as { page: string };
      return <PageHeadByName page={page} />;
    }
    case "data": {
      const { title, description, keywords, author, og } = props as PageSeoMeta;
      return (
        <Head>
          <title>{title}</title>
          <meta name="description" content={description} />
          <meta name="keywords" content={makekeywords(keywords)} />
          <meta name="author" content={author} />
          {og && (
            <>
              <meta property="og:title" content={og.title} />
              <meta property="og:type" content={og.type} />
              <meta property="og:url" content={og.url} />
              <meta property="og:image" content={og.image} />
            </>
          )}
          {children}
        </Head>
      );
    }
  }
}

function PageHeadByName({ page }: { page: string }) {
  const { t, i18n } = useTranslation(`page-${page}`);

  return (
    <Head>
      <title>{t("title")}</title>
      <meta name="description" content={t("description")} />
      {/* keywords is optional in page translations */}
      {i18n.exists("keywords") && (
        <meta name="keywords" content={t("keywords")} />
      )}
      <meta name="og:title" property="og:title" content={t("title")} />
      <>
        {config.locales.map(locale => (
          <link
            key={locale}
            rel="alternate"
            hrefLang={locale}
            href={
              locale === config.defaultLocale
                ? `https://grida.co/${page}`
                : `https://grida.co/${locale}/${page}`
            }
          />
        ))}
      </>
    </Head>
  );
}
