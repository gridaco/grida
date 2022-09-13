import { event_click_footer_menu } from "analytics";
import Link from "next/link";
import React from "react";
import { Flex, Text } from "rebass";

import { Sitemap } from "components/footer/sitemap";
import { useTheme } from "@emotion/react";

interface SitemapListProps {
  sitemap: Sitemap;
}

const SitemapList: React.FC<SitemapListProps> = ({ sitemap }) => {
  const { label, href, child } = sitemap;

  const theme = useTheme();

  const Header = () => {
    const HeaderText = (
      <Text
        className={href && "cursor"}
        fontWeight="500"
        fontSize="18px"
        color={theme.footer.group.color}
        mb="40px"
        style={{
          letterSpacing: "0em",
          fontWeight: 700,
        }}
      >
        {label}
      </Text>
    );
    return href ? <Link href={href}>{HeaderText}</Link> : HeaderText;
  };

  return (
    <Flex flexDirection="column">
      <Header />
      {child.map(i => (
        <Link href={i.href} key={i.label}>
          <Text
            onClick={() => {
              // log footer menu item click
              event_click_footer_menu({ menu: i.label });
            }}
            className="cursor"
            fontSize="14px"
            mb="15px"
            color={theme.footer.menu.color}
            style={{
              letterSpacing: "0em",
              fontWeight: 400,
            }}
          >
            {i.label}
          </Text>
        </Link>
      ))}
    </Flex>
  );
};

export default SitemapList;
