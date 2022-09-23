import { css } from "@emotion/react";
import styled from "@emotion/styled";
import { useRouter } from "next/router";
import React, { ReactElement } from "react";

import Footer from "components/footer";
import Header from "components/header";
import {
  ActivityBar,
  WindowHandle,
  StatusBar,
  Panel,
} from "components/mock-vscode";
import { breakpoints } from "sections/landingpage/_breakpoints";
import MusicHome from "sections/landingpage/demo-app";
import { getPageTranslations } from "utils/i18n";
import { useTranslation } from "next-i18next";
import PageHead from "components/page-head";

export const BackgroundGradient = css`
  background: linear-gradient(
      65.15deg,
      rgba(0, 0, 0, 0.2) 0%,
      rgba(0, 87, 255, 0) 100%
    ),
    linear-gradient(0deg, #221d29, #221d29);
`;

export const HeadingGradient = css`
  background: linear-gradient(269.61deg, #e6f2f0 0.33%, #f3fafa 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  line-height: normal;
`;

export default function VSCodePage() {
  const router = useRouter();
  const { t } = useTranslation("page-vscode");
  const onInstall = () => {
    router.push(
      "https://marketplace.visualstudio.com/items?itemName=grida.grida-vscode",
    );
  };
  return (
    <>
      <PageHead type="id" page="vscode" />
      <RootWrapper>
        <img
          style={{
            position: "absolute",
            zIndex: 0,
            objectFit: "cover",
          }}
          width="100%"
          height={924}
          src="/vscode/bg-pattern.svg"
        />
        <Contents>
          <Spacer />
          <Spacer />
          <Spacer />
          <Heading1>{t("heading")}</Heading1>
          <InstallButton onClick={onInstall}>{t("cta-install")}</InstallButton>
          {/* <p>Convert your figma design to React, Flutter, TS & HTML/CSS code.</p> */}
          <VscodeDemo>
            <WindowHandle />
            <DemoContents />
            <StatusBar></StatusBar>
          </VscodeDemo>
        </Contents>
        <Spacer />
      </RootWrapper>
    </>
  );
}

VSCodePage.getLayout = (page: ReactElement) => {
  return (
    <Page>
      <Header />
      {page}
      <Footer />
    </Page>
  );
};

VSCodePage.getTheme = () => "dark";

const Page = styled.div`
  ${BackgroundGradient}
`;

function DemoContents() {
  return (
    <Container>
      <ResponsiveActivityBar>
        <ActivityBar></ActivityBar>
      </ResponsiveActivityBar>
      <Sidebar>
        <IPhone11ProX1>
          <MusicHome />
        </IPhone11ProX1>
      </Sidebar>
      <Panel />
    </Container>
  );
}

const RootWrapper = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: center;
  gap: 0;
  height: 1200px;
  box-sizing: border-box;
  overflow: hidden;
`;

const InstallButton = styled.button`
  background-color: rgba(0, 102, 222, 0.54);
  border-radius: 2px;
  padding: 10px 16px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 21px;
  font-family: Inter, sans-serif;
  font-weight: 500;
  line-height: 98%;
  border: none;
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

const Contents = styled.div`
  z-index: 1;
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: center;
  flex: 1;
  gap: 68px;
  align-self: stretch;
  box-sizing: border-box;
  padding: 0px 0px 48px;

  @media ${breakpoints.xl} {
  }
  @media ${breakpoints.lg} {
    flex-direction: column;
    align-items: center;
    flex: 1;
    gap: 68px;
    align-self: stretch;
    padding: 0px 48px 48px;
  }
  @media ${breakpoints.md} {
    flex-direction: column;
    align-items: center;
    flex: 1;
    gap: 68px;
    align-self: stretch;
    padding: 0px 48px 48px;
  }
  @media ${breakpoints.sm} {
    flex-direction: column;
    align-items: center;
    flex: none;
    gap: 83px;
    height: 871px;
    align-self: stretch;
    padding: 0px 0px 48px;
  }
  @media ${breakpoints.xs} {
    flex-direction: column;
    align-items: center;
    flex: none;
    align-self: stretch;
    gap: 55px;
    padding: 64px 20px 24px;
  }
`;

const Spacer = styled.div`
  width: 1px;
  height: 1px;
`;

const Heading1 = styled.h2`
  margin-block: 0px;
  text-overflow: ellipsis;
  font-size: 64px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 700;
  ${HeadingGradient}
  text-align: center;

  @media ${breakpoints.xl} {
  }
  @media ${breakpoints.lg} {
    font-size: 64px;
    text-align: center;
  }
  @media ${breakpoints.md} {
    font-size: 64px;
    text-align: center;
  }
  @media ${breakpoints.sm} {
    font-size: 64px;
    font-weight: 700;
    width: 728px;
  }
  @media ${breakpoints.xs} {
    font-size: 32px;
    font-weight: 700;
    letter-spacing: -1px;
  }
`;

const VscodeDemo = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 0;
  box-shadow: 0px 12px 32px 2px rgba(0, 0, 0, 0.48);
  border: solid 1px rgba(69, 69, 69, 1);
  border-radius: 10px;
  height: 710px;
  background-color: rgba(37, 37, 38, 1);
  box-sizing: border-box;
  /* max-width: 1238px; */

  @media ${breakpoints.xl} {
    width: 1238px;
  }
  @media ${breakpoints.lg} {
    flex: 1;
    gap: 0;
    align-self: stretch;
  }
  @media ${breakpoints.md} {
    flex: 1;
    gap: 0;
    align-self: stretch;
  }
  @media ${breakpoints.sm} {
    flex-direction: column;
    align-items: start;
    flex: none;
    align-self: stretch;
    gap: 0;
    margin-left: 40px;
    margin-right: 40px;
    /* width: 728px; */
    height: 530px;
  }
  @media ${breakpoints.xs} {
    justify-content: flex-start;
    flex-direction: column;
    align-items: start;
    /* flex: 1; */
    gap: 0;
    border-radius: 10px;
    align-self: stretch;
    height: 490px;
  }
`;

const Container = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: 1;
  gap: 0;
  align-self: stretch;
  box-sizing: border-box;

  @media ${breakpoints.xl} {
  }
  @media ${breakpoints.lg} {
  }
  @media ${breakpoints.md} {
  }
  @media ${breakpoints.sm} {
    /* width: 300px; */
  }
  @media ${breakpoints.xs} {
    justify-content: flex-start;
    flex-direction: column;
    align-items: start;
    flex: 1;
    gap: 0;
    align-self: stretch;
  }
`;

const Sidebar = styled.div`
  width: 467px;
  overflow: hidden;
  background-color: rgba(37, 37, 38, 1);
  position: relative;
  align-self: stretch;
  @media ${breakpoints.xl} {
  }
  @media ${breakpoints.lg} {
  }
  @media ${breakpoints.md} {
  }
  @media ${breakpoints.sm} {
    width: 300px;
  }
  @media ${breakpoints.xs} {
    display: none;
  }
`;

const IPhone11ProX1 = styled.div`
  width: 375px;
  height: 812px;
  overflow: hidden;
  background-color: rgba(255, 255, 255, 1);
  border: solid 1px rgba(235, 235, 235, 1);
  position: absolute;
  box-shadow: 0px 4px 64px 8px rgba(146, 146, 146, 0.12);
  left: 45px;
  top: 42px;

  @media ${breakpoints.xs} {
    display: none;
  }
`;

const ResponsiveActivityBar = styled.div`
  @media ${breakpoints.xs} {
    display: none;
  }
`;

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await getPageTranslations(locale, "vscode")),
    },
  };
}
