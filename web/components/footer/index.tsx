import Icon from "components/icon";
import React from "react";
import { Box, Flex, Text } from "rebass";
import styled from "@emotion/styled";
import { Sitemap } from "./sitemap";
import SitemapList from "components/sitemap-list";
import { IconList } from "components/icon/icons";
import Link from "next/link";
import { URLS } from "utils/landingpage/constants";

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
        width={["320px", "730px", "985px", "1040px"]}
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
          <Text>Copyright © 2021 Bridged XYZ LLC</Text>
          <Flex className="policys">
            <Link href={URLS.landing.cookies_policy}>
              <Text className="cursor">Cookies</Text>
            </Link>
            <Link href={URLS.landing.privacy_policy}>
              <Text className="cursor">Privacy policy</Text>
            </Link>
            <Link href={URLS.landing.terms_and_conditions}>
              <Text className="cursor">Terms and conditions</Text>
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

  @media (max-width: 767px) {
    flex-direction: column;
  }
`;

const FooterBottom = styled(Flex)`
  color: #4e4e4e;
  font-size: 14px;
  @media (max-width: 767px) {
    flex-direction: column;

    .policys {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(95px, 1fr));
      margin-top: 20px;

      div {
        margin-top: 4px;
        white-space: nowrap;
        margin-left: 0px !important;
      }
    }
  }

  .policys {
    div {
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

  @media (max-width: 360px) {
    grid-column-gap: 80px;
  }
`;
