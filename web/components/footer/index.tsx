import styled from "@emotion/styled";
import Link from "next/link";
import React from "react";
import { Box, Flex, Text } from "rebass";

import Icon from "components/icon";
import { IconList } from "components/icon/icons";
import SitemapList from "components/sitemap-list";
import { URLS } from "utils/landingpage/constants";
import { media } from "utils/styled/media";
import { ThemeInterface } from "utils/styled/theme";

import { Sitemap } from "./sitemap";

const iconList: Array<{
  icon: keyof IconList;
  href: string;
}> = [
  {
    icon: "youtube",
    href: URLS.social.youtube,
  },
  {
    icon: "instagram",
    href: URLS.social.instagram,
  },
  {
    icon: "twitter",
    href: URLS.social.twitter,
  },
  {
    icon: "facebook",
    href: URLS.social.facebook,
  },
  {
    icon: "dribble",
    href: URLS.social.dribbble,
  },
  {
    icon: "github",
    href: URLS.social.github,
  },
];

const Footer = () => {
  return (
    <Flex alignItems="center" justifyContent="center" width="100%">
      <Flex
        width={["100%", "730px", "985px", "1040px"]}
        my={["40px", "50px", "100px", "150px"]}
        mx="20px"
        flexDirection="column"
      >
        <FooterContent width="100%">
          <Icon name="bridged" mr="100px" mb="64px" />
          <SitemapWrapper>
            {Sitemap.map(i => (
              <SitemapList key={i.label} sitemap={i} />
            ))}
          </SitemapWrapper>
        </FooterContent>
        <Box mt="80px">
          {iconList.map(i => (
            <Link href={i.href} key={i.icon}>
              <Icon className="cursor" key={i.icon} name={i.icon} mr="12px" />
            </Link>
          ))}
        </Box>
        <FooterBottom justifyContent="space-between" my="24px">
          <Text>Copyright © {new Date().getFullYear()} Grida.co</Text>
          <Flex className="policys">
            <Link href={URLS.landing.cookies_policy}>
              <span className="cursor">Cookies</span>
            </Link>
            <Link href={URLS.landing.privacy_policy}>
              <span className="cursor">Privacy policy</span>
            </Link>
            <Link href={URLS.landing.terms_and_conditions}>
              <span className="cursor">Terms and conditions</span>
            </Link>
          </Flex>
        </FooterBottom>
      </Flex>
    </Flex>
  );
};

export default Footer;

const FooterContent = styled(Flex)`
  justify-content: center;

  ${props => media(null, (props.theme as ThemeInterface).breakpoints[0])} {
    flex-direction: column;
  }
`;

const FooterBottom = styled(Flex)`
  color: #4e4e4e;
  font-size: 14px;
  letter-spacing: 0em;
  font-weight: 400;
  ${props => media(null, (props.theme as ThemeInterface).breakpoints[0])} {
    flex-direction: column;

    .policys {
      margin-top: 20px;
      display: grid;
      grid-template-rows: repeat(3, 20px);
      grid-template-columns: repeat(2, 80px);
      grid-template-areas:
        "span span ."
        "span . .";

      span {
        margin-top: 10px;
        white-space: nowrap;
        margin-left: 0px !important;
        margin-right: 16px;
      }
    }
  }

  .policys {
    span {
      margin-left: 16px;
    }
  }
`;

const SitemapWrapper = styled(Box)`
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  grid-column-gap: 80px;
  grid-row-gap: 64px;

  ${props => media(null, (props.theme as ThemeInterface).breakpoints[0])} {
    grid-column-gap: 80px;
  }
`;
