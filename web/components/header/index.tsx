import styled from "@emotion/styled";
import { event_click_header_menu } from "analytics";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { Flex, Text } from "theme-ui";
import Icon from "components/icon";
import { media } from "utils/styled/media";
import { Entity, HeaderMap } from "./headermap";
import HoverMenu from "./hover-menu";
import { useTheme } from "@emotion/react";
import { useTranslation } from "next-i18next";
import { LinkWithDocsFallback } from "components/fixme";
import { HeaderCta, HeaderMobileExpandedCta } from "./header-cta";
import {
  useFloating,
  useInteractions,
  useHover,
  shift,
  offset,
  arrow,
  autoUpdate,
} from "@floating-ui/react-dom-interactions";
import { Arrow } from "./arrow";

const Header = ({ banner }: { banner?: React.ReactNode }) => {
  const router = useRouter();
  const theme = useTheme();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [path, setPath] = useState<string>();

  useEffect(() => {
    // disable overflow scrolling
    if (isMobileMenuOpen) {
      document.getElementsByTagName("html")[0].style.overflowY = "hidden";
    } else {
      document.getElementsByTagName("html")[0].style.overflowY = "auto";
    }
  }, [isMobileMenuOpen]);

  const handleClickMenu = useCallback(
    () => setIsMobileMenuOpen(!isMobileMenuOpen),
    [isMobileMenuOpen],
  );

  useEffect(() => {
    setPath(router.asPath);

    if (path != router.asPath && path != "") {
      setIsMobileMenuOpen(false);
    }
  }, [router]);

  return (
    <HeaderMaster>
      {banner}
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
          <ForMobile className="cursor-pointer" onClick={handleClickMenu}>
            <Icon name={isMobileMenuOpen ? "headerClose" : "headerMenu"} />
          </ForMobile>

          <Flex
            as={"nav"}
            style={{
              alignSelf: "stretch",
              flex: 1,
              alignItems: "center",
            }}
            sx={{
              justifyContent: ["center", "flex-start"],
            }}
          >
            <Link href="/">
              <Logo
                className="cursor-pointer"
                name={theme.type === "light" ? "grida_black" : "grida_white"}
                width={32}
                height={32}
                mr={["32px", 0]}
              />
            </Link>
            <Link href="/">
              <ResponsiveTitle
                className="cursor-pointer"
                style={{
                  fontSize: "18px",
                  fontWeight: "800",
                }}
                ml="8px"
              >
                Grida
              </ResponsiveTitle>
            </Link>
            <HeaderMenuList>
              {HeaderMap.map(i => (
                <HeaderMenuItem
                  key={i.label}
                  variant="desktop"
                  {...i}
                  selected={path === i.href}
                />
              ))}
            </HeaderMenuList>
          </Flex>
          <NotForMobile>
            <HeaderCta isMobileMenuOpen={isMobileMenuOpen} />
          </NotForMobile>
        </Flex>

        {isMobileMenuOpen && (
          <MobileExpandedMenu background={theme.header.bg} />
        )}
      </HeaderWrapper>
    </HeaderMaster>
  );
};

export default Header;

function MobileExpandedMenu({ background }: { background: string }) {
  return (
    <ForMobile
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
      bg={background}
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
          <HeaderMenuItem variant="mobile" key={i.label} {...i} />
        ))}
      </Flex>
      <HeaderMobileExpandedCta />
    </ForMobile>
  );
}

function HeaderMenuItem({
  label,
  href,
  selected,
  variant,
  ...entity
}: {
  href?: string;
  label: string;
  selected?: boolean;
  variant: "desktop" | "mobile";
} & Entity) {
  const arrowRef = useRef<HTMLDivElement>();
  const [open, setOpen] = useState(false);
  const {
    context,
    x,
    y,
    reference,
    floating,
    strategy,
    middlewareData,
  } = useFloating({
    placement: "bottom",
    strategy: "absolute",
    open,
    onOpenChange: setOpen,
    whileElementsMounted: autoUpdate,
    middleware: [
      shift({
        padding: 40,
      }),
      offset({
        mainAxis: 25,
      }),
      arrow({ element: arrowRef }),
    ],
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    useHover(context, {
      delay: { close: 100 },
    }),
  ]);

  const { x: arrowX, y: arrowY } = middlewareData?.arrow || { x: 0, y: 0 };

  const { t } = useTranslation();
  const content = (
    <Label
      onClick={() => {
        // log header menu click event
        event_click_header_menu({ menu: label });
      }}
      className="cursor-pointer"
      mx={variant === "desktop" ? "18px" : undefined}
      my={variant === "mobile" ? "12px" : undefined}
      data-selected={selected || open}
      sx={{
        fontSize: ["13px", "14px", "16px"],
      }}
      style={{
        fontWeight: "bold",
      }}
    >
      {t(label)}
    </Label>
  );

  return (
    <div {...getReferenceProps({ ref: reference })}>
      <Li>
        {href ? (
          <LinkWithDocsFallback href={href}>{content}</LinkWithDocsFallback>
        ) : (
          content
        )}
      </Li>

      {entity.type == "group" && variant == "desktop" && (
        <FloatingMenuContainer
          {...getFloatingProps({ ref: floating })}
          data-expanded={open}
          style={{
            position: strategy,
            top: y ?? 0,
            left: x ?? 0,
          }}
        >
          <div
            id="arrow"
            ref={arrowRef}
            style={{
              visibility: open ? "visible" : "hidden",
              position: "absolute",
              top: arrowY,
              left: arrowX,
              transform: "translateY(-70%)",
              zIndex: 99,
            }}
          >
            <Arrow />
          </div>
          <HoverMenu
            item={{
              ...entity,
              label,
            }}
            // isExpand={open}
            type={"desktop"}
          />
        </FloatingMenuContainer>
      )}
    </div>
  );
}

const FloatingMenuContainer = styled.div`
  opacity: 0;
  pointer-events: none;

  &[data-expanded="true"] {
    opacity: 1;
    pointer-events: auto;
  }

  transition: all 0.1s ease-in-out;
`;

const Li = styled.li`
  list-style: none;
`;

const HeaderMaster = styled.header<{ border?: boolean }>`
  position: absolute;
  z-index: 9;
  border-bottom: ${props =>
    props.border ? "1px solid rgba(0, 0, 0, 0.025)" : "none"};
  width: 100%;
`;

const HeaderWrapper = styled.div`
  display: flex;
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

const HeaderMenuList = styled.ul`
  display: flex;
  align-items: center;
  margin: 0;
  padding-left: 40px;
  ${props => media(null, props.theme.breakpoints[1])} {
    padding-left: 12px;
  }

  ${props => media(null, props.theme.breakpoints[0])} {
    display: none;
  }
`;

const ForMobile = styled(Flex)`
  display: none;

  ${props => media(null, props.theme.breakpoints[0])} {
    display: flex;
  }
`;

const NotForMobile = styled(Flex)`
  display: flex;

  ${props => media(null, props.theme.breakpoints[0])} {
    display: none;
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
