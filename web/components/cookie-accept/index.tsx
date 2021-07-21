import React, { useEffect } from "react";
import styled from "@emotion/styled";
import { Flex, Heading } from "rebass";
import SectionLayout from "layouts/section";
import BlankArea from "components/blank-area";
import { useWindowWidth } from "utils/hooks/use-window-width";
import { defaultTheme } from "utils/styled";
import { LandingpageUrls } from "utils/landingpage/constants";
import Link from "next/link";

function replaceStylePxToNumber(stylePx: string) {
  return parseInt(stylePx.replace("px", ""));
}

interface CookieAcceptProps {
  accpetCookie: () => void;
}

const CookieAccept: React.FC<CookieAcceptProps> = ({ accpetCookie }) => {
  const width = useWindowWidth();

  return (
    <Positioner>
      <SectionLayout variant="content-default" alignContent="center">
        <Flex width="100%" justifyContent="space-between" alignItems="center">
          <Flex flexDirection="column">
            {width < replaceStylePxToNumber(defaultTheme.breakpoints[0]) ? (
              <Title>
                We use{" "}
                <Link href={LandingpageUrls.cookies_policy}>cookies</Link> for
                better website experience
              </Title>
            ) : (
              <Title>We use cookies</Title>
            )}
            {width > replaceStylePxToNumber(defaultTheme.breakpoints[0]) && (
              <Desc>
                Grida collects cookies for handling signin, analysing our
                traffic and making website usage faster.
                <Link href={LandingpageUrls.cookies_policy}>Learn more</Link>
              </Desc>
            )}
          </Flex>

          <Button className="cursor" onClick={() => accpetCookie()}>
            {width < replaceStylePxToNumber(defaultTheme.breakpoints[0])
              ? "OK"
              : "Accept"}
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
