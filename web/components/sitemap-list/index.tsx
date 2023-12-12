import React from "react";
import { event_click_footer_menu } from "analytics";
import Link from "next/link";
import { LinkWithDocsFallback } from "components/fixme";
import { Flex, Text } from "theme-ui";
import { Sitemap } from "components/footer/sitemap";
import { useTheme } from "@emotion/react";
import { useTranslation } from "next-i18next";

interface SitemapListProps {
  sitemap: Sitemap;
}

const SitemapList: React.FC<SitemapListProps> = ({ sitemap }) => {
  const { label, href, child } = sitemap;

  const theme = useTheme();
  const { t } = useTranslation("footer");

  const Header = () => {
    const HeaderText = (
      <Text
        className={href && "cursor"}
        color={theme.footer.group.color}
        mb="40px"
        style={{
          fontWeight: 700, // 500?
          fontSize: "18px",
          letterSpacing: "0em",
        }}
      >
        {t(label)}
      </Text>
    );
    return href ? <Link href={href}>{HeaderText}</Link> : HeaderText;
  };

  return (
    <Flex
      style={{
        flexDirection: "column",
      }}
    >
      <Header />
      {child.map(i => (
        <LinkWithDocsFallback href={i.href} key={i.label}>
          <Text
            onClick={() => {
              // log footer menu item click
              event_click_footer_menu({ menu: i.label });
            }}
            className="cursor-pointer hover:cursor-pointer"
            mb="15px"
            color={theme.footer.menu.color}
            style={{
              fontSize: "14px",
              letterSpacing: "0em",
              fontWeight: 400,
            }}
          >
            {t(i.label)}
          </Text>
        </LinkWithDocsFallback>
      ))}
    </Flex>
  );
};

export default SitemapList;
