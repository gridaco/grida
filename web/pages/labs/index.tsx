import Head from "next/head";
import styled from "@emotion/styled";
import Link from "next/link";
import React from "react";
import { getPageTranslations } from "utils/i18n";

export default function LabsPage() {
  return (
    <>
      <Head>
        <title>Grida Labs</title>
        <meta
          name="description"
          content="We are a team located in Seoul, Korea, Building a core AI Model for translating designs into code."
        />
      </Head>
      <Main>
        <section>
          <h1>Grida Labs</h1>
          <p>
            We are a team located in Seoul, Korea, Building a core AI Model for
            translating designs into code.
          </p>
        </section>
        <section>
          <h4>Join us</h4>
          <Link href={"/careers"}>Apply</Link>
        </section>
      </Main>
    </>
  );
}

const Main = styled.main`
  text-align: center;
  margin: auto;
  padding: 80px;

  h1 {
    font-size: 48px;
  }

  section {
    max-width: 400px;
    margin: auto;
  }
`;

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await getPageTranslations(locale)),
    },
  };
}
