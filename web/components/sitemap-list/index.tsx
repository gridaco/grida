import { event_click_footer_menu } from "analytics";
import Link from "next/link";
import React from "react";
import { Flex, Text } from "rebass";

import { Sitemap } from "components/footer/sitemap";

interface SitemapListProps {
  sitemap: Sitemap;
}

const SitemapList: React.FC<SitemapListProps> = ({ sitemap }) => {
  const { label, href, child } = sitemap;

  return (
    <Flex flexDirection="column">
      <Link href={href}>
        <Text
          className="cursor"
          fontWeight="500"
          fontSize="18px"
          mb="40px"
          style={{
            letterSpacing: "0em",
            fontWeight: 700,
          }}
        >
          {label}
        </Text>
      </Link>
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
            color="#292929"
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
