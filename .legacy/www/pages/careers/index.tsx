import React, { ReactElement } from "react";
import styled from "@emotion/styled";
import Footer from "components/footer";
import Header from "components/header";
import { useRouter } from "next/router";
import { getPageTranslations } from "utils/i18n";
import { useTranslation } from "next-i18next";
import LandingpageText from "components/landingpage/text";
import PageHead from "components/page-head";

export default function CareersPage() {
  const { t } = useTranslation("page-careers");
  const router = useRouter();
  const onContact = () => {
    router.push("mailto:universe@grida.co");
  };
  return (
    <>
      <PageHead type="id" page="careers" />
      <div style={{ textAlign: "center" }}>
        <Headings>
          <LandingpageText
            fontFamily="Inter, sans-serif !important"
            fontWeight="900"
            variant="h1"
            color="rgba(255, 255, 255, 0.95)"
          >
            {t("heading")}
          </LandingpageText>
          <Tagline>{t("tagline")}</Tagline>
        </Headings>
        <Button onClick={onContact}>{t("cta-contact")}</Button>
        <div
          style={{
            userSelect: "none",
            // center all
            position: "relative",
            left: "50%",
            transform: "translateX(-50%)",
          }}
        >
          <WorldMap />
        </div>
      </div>
    </>
  );
}

const Headings = styled.div`
  z-index: 1;
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: center;
  width: max-content;
  margin: auto;
  flex: none;
  position: absolute;
  top: 25%;
  left: 50%;
  transform: translateX(-50%);
  box-sizing: border-box;
`;

const Tagline = styled.span`
  color: rgba(255, 255, 255, 0.8);
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: Inter, sans-serif;
  font-weight: 400;
  text-align: center;
`;

const Button = styled.button`
  z-index: 1;
  position: absolute;
  top: 60%;
  left: 50%;
  transform: translateX(-50%);

  box-shadow: 0px 4px 16px 0px rgba(0, 0, 0, 0.5);
  background-color: rgb(18, 18, 18);
  border: solid 1px rgb(52, 52, 52);
  border-radius: 4px;
  padding: 10px;
  color: white;
  font-size: 14px;
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

CareersPage.getLayout = (page: ReactElement) => {
  return (
    <Page>
      <Header />
      {page}
      <Footer />
    </Page>
  );
};

CareersPage.getTheme = () => "dark";

const Page = styled.div`
  background: black;
`;

function WorldMap() {
  return (
    <img
      style={{
        userSelect: "none",
        pointerEvents: "none",
        display: "block",
        margin: "auto",
        transform: "translateY(80px) scale(150%)",
        overflow: "show",
      }}
      // layout="fill"
      width={"100%"}
      height={716}
      src={"/assets/world-map.svg"}
    />
  );
}

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await getPageTranslations(locale, "careers")),
    },
  };
}
