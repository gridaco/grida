import styled from "@emotion/styled";
import React from "react";
import Link from "next/link";
import { Flex, Heading } from "theme-ui";
import SectionLayout from "layouts/section";
import { useWindowWidth } from "utils/hooks/use-window-width";
import { LandingpageUrls } from "utils/landingpage/constants";
import { breakpoints } from "theme/shared";
import { useTranslation } from "next-i18next";

function replaceStylePxToNumber(stylePx: string) {
  return parseInt(stylePx.replace("px", ""));
}

interface CookieAcceptProps {
  accpetCookie: () => void;
}

const CookieAccept: React.FC<CookieAcceptProps> = ({ accpetCookie }) => {
  const { t: tc } = useTranslation("common");
  const { t } = useTranslation(["app", "common"], {
    keyPrefix: "cookie-consent",
  });

  const width = useWindowWidth();

  return (
    <Positioner>
      <SectionLayout variant="content-default" alignContent="center">
        <Flex
          style={{
            width: "100%",
            gap: 12,
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Flex style={{ flexDirection: "column" }}>
            {width < replaceStylePxToNumber(breakpoints[0]) ? (
              <Title>
                {t("mobile.we-use")}{" "}
                <Link
                  href={LandingpageUrls.cookies_policy}
                  className="lowercase"
                >
                  {tc("cookies")}
                </Link>{" "}
                {t("mobile.for")}
              </Title>
            ) : (
              <Title>{t("heading")}</Title>
            )}
            {width > replaceStylePxToNumber(breakpoints[0]) && (
              <Desc>
                {t("p")}
                <Link href={LandingpageUrls.cookies_policy}>
                  {tc("learn-more")}
                </Link>
              </Desc>
            )}
          </Flex>

          <Button className="cursor" onClick={() => accpetCookie()}>
            {width < replaceStylePxToNumber(breakpoints[0])
              ? tc("ok")
              : tc("accept")}
          </Button>
        </Flex>
      </SectionLayout>
    </Positioner>
  );
};

export default CookieAccept;

const Positioner = styled.div`
  display: flex;
  align-items: center;
  flex-direction: column;
  justify-content: center;

  position: fixed;
  bottom: 0;

  width: 100%;
  height: 110px;
  background-color: #fff;
  z-index: 998;

  a {
    margin: 0px 2px;
    text-decoration: underline;
  }
`;

const Desc = styled.div`
  width: 100%;

  font-size: 14px;
  line-height: 17px;
  letter-spacing: 0em;

  color: #4e4e4e;
`;

const Button = styled.div`
  font-weight: 500;
  font-size: 16px;

  display: flex;
  align-items: center;
  justify-content: center;
  letter-spacing: 0em;

  color: #2562ff;
`;

const Title = styled(Heading)`
  color: #4e4e4e;
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 8px;
  line-height: 20px;
  letter-spacing: 0em;
`;
