import styled from "@emotion/styled";
import { useRouter } from "next/router";
import React, { useState } from "react";

import { SectionOneCommand } from "../../grida/section-command";
import { SectionConfiguration } from "../../grida/section-configuration";
import { SectionDemo } from "../../grida/section-demo";
import { FooterCtaSection as SectionFooterCta } from "../../grida/section-footer-cta";
import { SectionHero } from "../../grida/section-hero";
import { useTranslation } from "next-i18next";
import { getPageTranslations } from "utils/i18n";
import PageHead from "components/page-head";

export default function Home() {
  const router = useRouter();
  const { t } = useTranslation("page-cli");
  const [copied, setCopied] = useState(false);

  const onstartclick = () => {
    router.push("/docs/cli", "/docs/cli", {
      // TODO: disable explicit locale once docs locale resolution is fixed.
      locale: "en",
    });
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
      <PageHead type="id" page="cli">
        <link rel="alternate" hrefLang="en" href={`https://grida.co/cli`} />
      </PageHead>
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
      ...(await getPageTranslations(locale, "cli")),
    },
  };
}
