import styled from "@emotion/styled";
import Head from "next/head";
import { useRouter } from "next/router";
import React, { useState } from "react";

import { SectionOneCommand } from "../../grida/section-command";
import { SectionConfiguration } from "../../grida/section-configuration";
import { SectionDemo } from "../../grida/section-demo";
import { FooterCtaSection as SectionFooterCta } from "../../grida/section-footer-cta";
import { SectionHero } from "../../grida/section-hero";

import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useTranslation } from "next-i18next";

export default function Home() {
  const router = useRouter();
  const { t } = useTranslation("page-cli");
  const [copied, setCopied] = useState(false);

  const onstartclick = () => {
    router.push("/docs/cli");
  };

  const oncopycommandclick = (t: string) => {
    navigator.clipboard.writeText(t);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 1000);
  };

  return (
    <>
      <Head>
        <title>{t("title")}</title>
        <meta name="description" content={t("description")} />
        <meta name="keywords" content={t("keywords")} />
        <meta name="og:title" property="og:title" content={t("title")} />
      </Head>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
        }}
      >
        <SectionHero
          copyText={copied ? t("copied-to-clipboard") : t("cta-command")}
          onCopyClick={oncopycommandclick}
          onStartClick={onstartclick}
        />
        <SectionOneCommand />
        <SectionDemo />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
          }}
        >
          <SectionConfiguration onSeeTheDocsClick={onstartclick} />
          <div
            style={{
              position: "relative",
              bottom: 50, //?
              margin: "0 10vw 0 10vw",
            }}
          >
            <SectionFooterCta
              copyText={copied ? t("copied-to-clipboard") : t("cta-command")}
              onCopyClick={oncopycommandclick}
              onStartClick={onstartclick}
            />
          </div>
        </div>
        <MadeWithGridaFooterText
          dangerouslySetInnerHTML={{
            __html: t("this-page-was-made-with-grida-cli"),
          }}
        />
      </div>
      <div style={{ height: 80 }} />
    </>
  );
}

const MadeWithGridaFooterText = styled.a`
  color: rgba(0, 0, 0, 0.6);
  text-overflow: ellipsis;
  font-size: 16px;
  font-family: "Roboto Mono", monospace !important;
  font-weight: 400;
  line-height: 167%;
  text-align: center;
  width: 100%;
  box-sizing: border-box;
  padding-left: 32px;
  padding-right: 32px;
`;

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, [
        "common",
        "header",
        "footer",
        "page-cli",
      ])),
      // Will be passed to the page component as props
    },
  };
}
