import styled from "@emotion/styled";
import Head from "next/head";
import { useRouter } from "next/router";
import React, { useState } from "react";

import { FooterCtaSection as SectionFooterCta } from "../../grida/FooterCtaSection";
import { SectionConfiguration } from "../../grida/SectionConfiguration";
import { SectionDemo } from "../../grida/SectionDemo";
import { SectionHero } from "../../grida/SectionHero";
import { SectionOneCommand } from "../../grida/SectionOneCommand";

export default function Home() {
  const router = useRouter();
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
        <title>Grida CLI</title>
        <meta
          name="description"
          content="Grida CLI is a command line interface for Grida."
        />
      </Head>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
        }}
      >
        <SectionHero
          copyText={copied ? "Copied to clipboard" : "npx grida init"}
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
          <SectionConfiguration />
          <div
            style={{
              position: "relative",
              bottom: 50, //?
              margin: "0 10vw 0 10vw",
            }}
          >
            <SectionFooterCta
              copyText={copied ? "Copied to clipboard" : "npx grida init"}
              onCopyClick={oncopycommandclick}
              onStartClick={onstartclick}
            />
          </div>
        </div>
        <MadeWithGridaFooterText>
          This page was made with grida CLI under 7 minutes
          <br />
          with NextJS & @emotion/styled
        </MadeWithGridaFooterText>
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
`;
