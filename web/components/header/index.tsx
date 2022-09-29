import styled from "@emotion/styled";
import { event_click_header_menu } from "analytics";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useState, useEffect, useCallback } from "react";
import { Box, Flex, Text, Button } from "theme-ui";
import Icon from "components/icon";
import { media } from "utils/styled/media";
import { GroupEntity, HeaderMap } from "./headermap";
import HoverMenu from "./hover-menu";
import { useTheme } from "@emotion/react";
import { useTranslation } from "next-i18next";
import { LinkWithDocsFallback } from "components/fixme";
import { HeaderCta } from "./header-cta";

const Header = () => {
  const router = useRouter();
  const theme = useTheme();

  const [hoveringItem, setHoveringItem] = useState<string>();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [path, setPath] = useState<string>();

  useEffect(() => {
    const is_hovering_item_has_group =
      HeaderMap.find(i => i.label === hoveringItem)?.type === "group"
        ? true
        : false;

    // disable overflow scrolling
    if (isMobileMenuOpen || is_hovering_item_has_group) {
      document.getElementsByTagName("html")[0].style.overflowY = "hidden";
    } else {
      document.getElementsByTagName("html")[0].style.overflowY = "auto";
    }
  }, [isMobileMenuOpen, hoveringItem]);

  const handleClickMenu = useCallback(
    () => setIsMobileMenuOpen(!isMobileMenuOpen),
    [isMobileMenuOpen],
  );

  const showHoverMenu = useCallback((key: string) => setHoveringItem(key), []);
  const hideHoverMenu = useCallback(() => setHoveringItem(undefined), []);

  useEffect(() => {
    setPath(router.asPath);

    if (path != router.asPath && path != "") {
      setIsMobileMenuOpen(false);
    }
  }, [router]);

  return (
    <>
      <HeaderWrapper>
        <Flex
          sx={{
            width: ["100%", "728px", "984px", "1040px"],
            justifyContent: "space-between",
            alignItems: "center",
            height: "100%",
          }}
          mx={["20px"]}
        >
          <ResponsiveMenu className="cursor" onClick={handleClickMenu}>
            <Icon name={isMobileMenuOpen ? "headerClose" : "headerMenu"} />
          </ResponsiveMenu>

          <Flex
            as={"nav"}
            style={{
              alignItems: "center",
            }}
          >
            <Link href="/">
              <Logo
                className="cursor"
                name={theme.type === "light" ? "grida_black" : "grida_white"}
                width={32}
                height={32}
                ml={["8px", "8px", "8px", "8px"]}
              />
            </Link>
            <Link href="/">
              <ResponsiveTitle
                className="cursor"
                style={{
                  fontSize: "18px",
                  fontWeight: "600",
                }}
                ml="8px"
              >
                Grida
              </ResponsiveTitle>
            </Link>
            <MenuList>
              {HeaderMap.map(i => (
                <Item
                  key={i.label}
                  variant="desktop"
                  {...i}
                  onHover={() => {
                    showHoverMenu(i.label);
                  }}
                  selected={path === i.href || hoveringItem === i.label}
                />
              ))}
            </MenuList>
          </Flex>
          <HeaderCta isMobileMenuOpen={isMobileMenuOpen} />
        </Flex>

        {isMobileMenuOpen && (
          <ResponsiveMenu
            style={{
              width: "100%",
              flexDirection: "column",
              justifyContent: "space-between",
              position: "absolute",
              top: 0,
              paddingTop: 60,
              zIndex: -1,
              height: "100vh",
            }}
            bg={theme.header.bg}
            px="20px"
            pb="24px"
          >
            <Flex
              mt="24px"
              style={{
                flexDirection: "column",
                gap: 24,
              }}
            >
              {HeaderMap.map(i => (
                <Item variant="mobile" key={i.label} {...i} />
              ))}
            </Flex>

            <HeaderCta mobile isMobileMenuOpen />
          </ResponsiveMenu>
        )}
      </HeaderWrapper>

      <div
        style={{
          zIndex: 10,
        }}
      >
        {HeaderMap.filter(i => i.type === "group").map(
          (i: GroupEntity, index) => (
            <HoverMenu
              key={index}
              item={i}
              isExpand={i.label == hoveringItem}
              onExit={function(): void {
                hideHoverMenu();
              }}
              // TODO:
              type={"desktop"}
            />
          ),
        )}
      </div>
    </>
  );
};

export default Header;

function Item({
  label,
  href,
  selected,
  onHover,
  variant,
}: {
  href?: string;
  label: string;
  selected?: boolean;
  onHover?: () => void;
  variant: "desktop" | "mobile";
}) {
  const { t } = useTranslation();
  const content = (
    <Label
      onClick={() => {
        // log header menu click event
        event_click_header_menu({ menu: label });
      }}
      onMouseOver={onHover}
      className="cursor"
      mx={variant === "desktop" ? "18px" : undefined}
      my={variant === "mobile" ? "12px" : undefined}
      data-selected={selected}
      style={{
        fontWeight: "bold",
        fontSize: "16px",
      }}
    >
      {t(label)}
    </Label>
  );
  if (href) {
    return (
      <li style={{ listStyle: "none" }}>
        <LinkWithDocsFallback href={href}>
          <a>{content}</a>
        </LinkWithDocsFallback>
      </li>
    );
  } else {
    return <li style={{ listStyle: "none" }}>{content}</li>;
  }
}

const HeaderWrapper = styled.header<{ border?: boolean }>`
  position: absolute;
  display: flex;
  z-index: 9;
  border-bottom: ${props =>
    props.border ? "1px solid rgba(0, 0, 0, 0.025)" : "none"};
  width: 100%;
  height: 60px;
  justify-content: center;
  align-items: center;
`;

const Logo = styled(Icon)`
  ${props => media(null, props.theme.breakpoints[0])} {
    position: absolute;
  }
`;

const Label = styled(Text)`
  font-weight: 500 !important;
  letter-spacing: 0em;
  font-size: 15px;
  color: ${p => p.theme.header.menu.resting};

  &:hover {
    color: ${p => p.theme.header.menu.hover};
  }

  &[data-selected="true"] {
    color: ${p => p.theme.header.menu.hover};
  }

  transition: all 0.1s ease-in-out;
`;

const MenuList = styled.ul`
  display: flex;
  margin-left: 20px;
  align-items: center;
  height: 24px;

  ${props => media(null, props.theme.breakpoints[0])} {
    display: none;
  }
`;

const ResponsiveMenu = styled(Flex)`
  display: none;

  ${props => media(null, props.theme.breakpoints[0])} {
    display: flex;
  }
`;

const ResponsiveTitle = styled(Text)`
  letter-spacing: -0.035em;
  font-weight: 600;
  color: ${p => p.theme.header.color};
  ${props => media(null, props.theme.breakpoints[1])} {
    display: none;
  }
`;
