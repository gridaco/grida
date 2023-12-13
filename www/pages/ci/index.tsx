import React, { ReactElement, useRef } from "react";
import styled from "@emotion/styled";
import Head from "next/head";
import Link from "next/link";
import Image from "next/image";
import Footer from "components/footer";
import Header from "components/header";
import { PageLayoutConfig } from "layouts/index";
import { getPageTranslations } from "utils/i18n";
import sifigrid from "../../public/enterprise/api/sifi-grid.png";

export default function CIPage() {
  return (
    <>
      <Head>
        <title>Figma CI by Grida</title>
        <meta
          name="description"
          content="Figma CI Allows you to integrate figma design as a resource to work with your CI/CD pipeline."
        />
        <meta
          name="keywords"
          content="CI/CD, CI, CD, Figma, DevOps, Figma Automation, Automation, Github Action, Jenkins"
        />
      </Head>
      <Main>
        <MainCard />
        <div className="bg">
          <Image src={sifigrid} alt="background" />
        </div>
      </Main>
    </>
  );
}

const Main = styled.main`
  min-height: 100vh;
  width: 100vw;
  color: white;
  display: flex;
  justify-content: center;
  align-items: center;

  .bg {
    user-select: none;
    pointer-events: none;
    position: absolute;
    top: calc(50vh);
    width: fit-content;
    height: 100%;
    overflow: hidden;
    span {
      z-index: 0;
      transform: perspective(900px) rotateX(75deg) scale(0.5);
      transform-origin: top;
    }

    ::after {
      z-index: 1;
      content: "";
      position: absolute;
      background: linear-gradient(
        180deg,
        rgba(0, 0, 0, 0) 0%,
        rgba(0, 0, 0, 1) 100%
      );
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
    }
  }
`;

function MainCard() {
  return (
    <MainCardWrapper>
      <span className="earlyaccess">Early Access</span>
      <h1>Figma CI</h1>
      <Link href="/contact/sales">
        <CTAButton>Contact Sales</CTAButton>
      </Link>
    </MainCardWrapper>
  );
}

const MainCardWrapper = styled.div`
  z-index: 1;
  max-width: 1040px;
  overflow: hidden;
  background-color: rgba(104, 104, 104, 0.12);
  padding: 60px 120px;
  /* border styles */
  ::before {
    pointer-events: none;
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 11px;
    padding: 2px;
    background: linear-gradient(135deg, #e776ce4f, #5ccf340f);
    -webkit-mask: linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
  }

  border-radius: 12px;
  position: relative;
  backdrop-filter: blur(8px);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;

  .earlyaccess {
    color: rgba(255, 255, 255, 0.87);
    text-overflow: ellipsis;
    font-size: 32px;
    font-family: Caveat, sans-serif;
    font-weight: 700;
    line-height: 96%;
    text-align: center;
  }

  h1 {
    text-overflow: ellipsis;
    font-size: 100px;
    font-family: Inter, sans-serif;
    font-weight: 900;
    text-align: center;
  }
`;

const CTAButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  box-shadow: 0px 4px 16px 0px rgba(0, 0, 0, 0.04);
  background-color: rgba(255, 255, 255, 0.1);
  border: solid 1px white;
  border-radius: 4px;
  padding: 10px;
  color: white;
  font-size: 15px;
  font-family: Inter, sans-serif;
  font-weight: 500;
  outline: none;
  cursor: pointer;

  :hover {
    opacity: 0.8;
  }

  :disabled {
    opacity: 0.5;
  }

  :active {
    opacity: 1;
  }

  :focus {
  }
`;

CIPage.layoutConfig = {
  mt: 0,
} as PageLayoutConfig;

CIPage.getLayout = (page: ReactElement) => {
  return (
    <div
      style={{
        background: "black",
      }}
    >
      <Header />
      {page}
      <Footer />
    </div>
  );
};

CIPage.getTheme = () => "dark";

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await getPageTranslations(locale, "enterprise/api")),
    },
  };
}
