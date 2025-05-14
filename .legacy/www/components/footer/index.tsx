import styled from "@emotion/styled";
import Link from "next/link";
import React from "react";
import { Box, Flex, Text } from "theme-ui";

import Icon from "components/icon";
import { IconList } from "components/icon/icons";
import SitemapList from "components/sitemap-list";
import { URLS } from "utils/landingpage/constants";
import { media } from "utils/styled/media";

import { Sitemap } from "./sitemap";
import { useTheme } from "@emotion/react";
import { useTranslation } from "next-i18next";
import { useRouter } from "next/router";

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
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation("footer");

  return (
    <Flex
      style={{
        position: "relative",
        zIndex: 1,
        width: "100%",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Flex
        sx={{
          width: ["100%", "730px", "985px", "1040px"],
          flexDirection: "column",
        }}
        my={["40px", "50px", "100px", "150px"]}
        mx="20px"
      >
        <FooterContent style={{ width: "100%" }}>
          <Icon
            name={theme.type === "light" ? "grida_black" : "grida_white"}
            mr="100px"
            mb="64px"
          />
          <SitemapWrapper>
            {Sitemap.map(i => (
              <SitemapList key={i.label} sitemap={i} />
            ))}
          </SitemapWrapper>
        </FooterContent>
        <Box mt="80px">
          {iconList.map(i => (
            <Link href={i.href} key={i.icon}>
              <Icon className="cursor-pointer" key={i.icon} name={i.icon} mr="12px" />
            </Link>
          ))}
        </Box>
        <FooterBottom
          style={{
            justifyContent: "space-between",
          }}
          my="24px"
        >
          <Text>Copyright © {new Date().getFullYear()} Grida Inc.</Text>
          <Flex className="locales">
            <Link href={router.route} locale="en">
              English
            </Link>
            <Link href={router.route} locale="ja">
              日本語
            </Link>
            <Link href={router.route} locale="ko">
              한국어
            </Link>
            <Link href={router.route} locale="fr">
              Français
            </Link>
          </Flex>
          <Flex className="policys">
            <Link href={URLS.landing.cookies_policy} locale="en">
              <span className="cursor-pointer">{t("cookie-policy")}</span>
            </Link>
            <Link href={URLS.landing.privacy_policy} locale="en">
              <span className="cursor-pointer">{t("privacy-policy")}</span>
            </Link>
            <Link href={URLS.landing.terms_and_conditions} locale="en">
              <span className="cursor-pointer">{t("terms-and-conditions")}</span>
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

  ${props => media(null, props.theme.breakpoints[0])} {
    flex-direction: column;
  }
`;

const FooterBottom = styled(Flex)`
  color: ${p => p.theme.footer.bottom.color};
  font-size: 14px;
  flex-wrap: wrap;
  letter-spacing: 0em;
  font-weight: 400;
  ${props => media(null, props.theme.breakpoints[0])} {
    flex-direction: column;

    gap: 20px;

    .policys {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      span {
        white-space: nowrap;
        margin-left: 0px !important;
      }
    }
  }

  .policys {
    gap: 16px;
  }

  .locales {
    gap: 8px;
    align-items: center;
    span {
      cursor: pointer;
      :hover {
        opacity: 0.9;
      }
    }
    transition: all 0.2s ease-in-out;
  }
`;

const SitemapWrapper = styled(Box)`
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  grid-column-gap: 80px;
  grid-row-gap: 64px;

  ${props => media(null, props.theme.breakpoints[0])} {
    grid-column-gap: 80px;
  }
`;
