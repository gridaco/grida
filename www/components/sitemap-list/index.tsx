import React from "react";
import { event_click_footer_menu } from "analytics";
import Link from "next/link";
import { LinkWithDocsFallback } from "components/fixme";
import { Flex, Text } from "theme-ui";
import { Sitemap } from "components/footer/sitemap";
import { useTheme } from "@emotion/react";
import { useTranslation } from "next-i18next";

export default function SitemapList({ sitemap }: {
  sitemap: Sitemap;
}) {
  const { label, href, child } = sitemap;

  const theme = useTheme();
  const { t } = useTranslation("footer");

  const Header = () => {
    const HeaderText = (
      <Text
        color={theme.footer.group.color}
        style={{
          fontWeight: 700, // 500?
          fontSize: "18px",
          letterSpacing: "0em",
        }}
      >
        {t(label)}
      </Text>
    );
    return (
      <span className="cursor-default mb-10">
        {
          href ?
            <Link href={href} className="cursor-pointer">{HeaderText}</Link>
            : HeaderText
        }
      </span>
    )
  };

  return (
    <Flex
      style={{
        flexDirection: "column",
      }}
    >
      <Header />
      {child.map(i => (
        <LinkWithDocsFallback
          key={i.label}
          className="mb-3 cursor-pointer hover:underline"
          href={i.href}
        >
          <span
            className="text-sm"
            onClick={() => {
              // log footer menu item click
              event_click_footer_menu({ menu: i.label });
            }}
            color={theme.footer.menu.color}
          >
            {t(i.label)}
          </span>
        </LinkWithDocsFallback>
      ))}
    </Flex>
  );
};

