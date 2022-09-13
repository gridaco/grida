import styled from "@emotion/styled";
import { event_click_header_menu } from "analytics";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useState, useEffect, useCallback } from "react";
import { Box, Flex, Text, Button } from "rebass";

import Icon from "components/icon";
import { useAuthState } from "utils/hooks/use-auth-state";
import { URLS } from "utils/landingpage/constants";
import { media } from "utils/styled/media";
import { center } from "utils/styled/styles";

import { GroupEntity, HeaderMap } from "./headermap";
import HoverMenu from "./hover-menu";
import { useTheme } from "@emotion/react";

const Header = () => {
  const router = useRouter();
  const auth = useAuthState();
  const theme = useTheme();

  const [hoveringItem, setHoveringItem] = useState<string>();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [path, setPath] = useState<string>();

  useEffect(() => {
    const is_hovering_item_has_group =
      HeaderMap.find(i => i.label === hoveringItem)?.type === "group"
        ? true
        : false;

    // disable overflow scrolling
    if (isMenuOpen || is_hovering_item_has_group) {
      document.getElementsByTagName("html")[0].style.overflowY = "hidden";
    } else {
      document.getElementsByTagName("html")[0].style.overflowY = "auto";
    }
  }, [isMenuOpen, hoveringItem]);

  const handleClickMenu = useCallback(() => setIsMenuOpen(!isMenuOpen), [
    isMenuOpen,
  ]);

  const showHoverMenu = useCallback((key: string) => setHoveringItem(key), []);
  const hideHoverMenu = useCallback(() => setHoveringItem(undefined), []);

  const handleSignupClick = () => {
    if (auth == "signedin") {
      window.location.href = URLS.landing.current_app;
    } else {
      window.location.href = URLS.landing.signup_with_return;
    }
  };

  const handleSigninOrMoveAppClick = () => {
    if (auth == "signedin") {
      // move to app
      window.location.href = URLS.landing.current_app;
    } else {
      !isMenuOpen && (window.location.href = URLS.landing.signin_with_return);
    }
  };

  useEffect(() => {
    setPath(router.asPath);

    if (path != router.asPath && path != "") {
      setIsMenuOpen(false);
    }
  }, [router]);

  return (
    <>
      <HeaderWrapper>
        <Flex
          width={["100%", "728px", "984px", "1040px"]}
          mx={["20px"]}
          justifyContent="space-between"
          alignItems="center"
          height="100%"
        >
          <ResponsiveMenu className="cursor" onClick={handleClickMenu}>
            <Icon name={isMenuOpen ? "headerClose" : "headerMenu"} />
          </ResponsiveMenu>

          <Flex as={"nav"} alignItems="center">
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
                fontSize="18px"
                ml="8px"
                fontWeight="600"
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

          <SignupButton
            onClick={handleSignupClick}
            style={{ opacity: isMenuOpen ? 0 : 1 }}
            fontSize={["13px", "13px", "15px"]}
            p={["6px 10px", "6px 10px", "9px 20px", "9px 20px"]}
            variant="noShadow"
          >
            {auth == "signedin" ? "Go to App" : "Sign up"}
          </SignupButton>
        </Flex>

        {isMenuOpen && (
          <ResponsiveMenu
            justifyContent="space-between"
            style={{
              position: "absolute",
              top: 60,
              height: "calc(100vh - 60px)",
            }}
            bg="#fff"
            width="100%"
            px="20px"
            pb="24px"
            flexDirection="column"
          >
            <Flex mt="24px" flexDirection="column">
              {HeaderMap.map(i => (
                <Item variant="mobile" key={i.label} {...i} />
              ))}
            </Flex>

            <Box>
              <Button
                variant="noShadow"
                width="100%"
                bg={theme.header.accent}
                height="35px"
                fontSize="13px"
                mb="12px"
                disabled={auth == "signedin"}
                style={{
                  opacity: (auth == "signedin") != null ? 0 : 1,
                }}
                onClick={handleSignupClick}
              >
                Sign up
              </Button>
              <Button
                variant="noShadow"
                width="100%"
                color={theme.header.color}
                height="35px"
                fontSize="13px"
                style={center}
                onClick={handleSigninOrMoveAppClick}
              >
                {auth == "signedin" ? (
                  "Go to App"
                ) : (
                  <React.Fragment>
                    <Icon name="lock" isVerticalMiddle mr="6px" />
                    Sign in
                  </React.Fragment>
                )}
              </Button>
            </Box>
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
      fontWeight="bold"
      fontSize="16px"
    >
      {label}
    </Label>
  );
  if (href) {
    return (
      <li style={{ listStyle: "none" }}>
        <a href={href}>{content}</a>
      </li>
    );
  } else {
    return <li style={{ listStyle: "none" }}>{content}</li>;
  }
}

const HeaderWrapper = styled.header`
  position: absolute;
  display: flex;
  z-index: 9;
  border-bottom: 1px solid rgba(1, 1, 1, 0.03);
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
  font-weight: 500;
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

const SignupButton = styled(Button)`
  height: 35px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0 !important;
  color: ${p => p.theme.header.accent} !important;
  background: none;
  padding: 0 !important;

  ${props => media(props.theme.breakpoints[0], null)} {
    height: 25px;
    opacity: 1 !important;
  }

  ${props => media(props.theme.breakpoints[0], null)} {
  }
`;

const MenuList = styled.ul`
  display: flex;
  margin-left: 40px;
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
