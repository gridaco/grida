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
import { ThemeInterface } from "utils/styled/theme";

import { GroupEntity, HeaderMap } from "./headermap";
import HoverMenu from "./hover-menu";

const Header = () => {
  const router = useRouter();
  const auth = useAuthState();

  const [hoveringItem, setHoveringItem] = useState<string>();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [path, setPath] = useState<string>();

  useEffect(() => {
    // disable overflow scrolling
    if (isMenuOpen) {
      document.getElementsByTagName("html")[0].style.overflowY = "hidden";
    } else {
      document.getElementsByTagName("html")[0].style.overflowY = "auto";
    }
  }, [isMenuOpen]);

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

        <Flex alignItems="center">
          <Link href="/">
            <Logo
              className="cursor"
              name="bridged"
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
          <NavigationWrapper ml="60px" alignItems="center">
            {HeaderMap.map(i => (
              <Item
                key={i.label}
                variant="desktop"
                {...i}
                onHover={() => {
                  showHoverMenu(i.label);
                }}
                selected={path === i.href}
              />
            ))}
          </NavigationWrapper>
        </Flex>

        <SignupButton
          onClick={handleSignupClick}
          style={{ opacity: isMenuOpen && 0 }}
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
              bg="#2562FF"
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
              bg="#fff"
              color="#000"
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
    </HeaderWrapper>
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
      mx={variant === "desktop" ? "12px" : undefined}
      my={variant === "mobile" ? "12px" : undefined}
      data-selected={selected}
      fontWeight="bold"
      fontSize="16px"
    >
      {label}
    </Label>
  );
  if (href) {
    return <Link href={href}>{content}</Link>;
  } else {
    return content;
  }
}

const HeaderWrapper = styled(Flex)`
  position: absolute;
  /* background-color: #fff; */
  z-index: 999;
  border-bottom: 1px solid #f8f8f8;
  width: 100%;
  height: 60px;
  justify-content: center;
  align-items: center;
`;

const Logo = styled(Icon)`
  ${props => media(null, (props.theme as ThemeInterface).breakpoints[0])} {
    position: absolute;
  }
`;

const Label = styled(Text)`
  font-weight: 500;
  letter-spacing: 0em;
  color: rgba(0, 0, 0, 0.55);

  &:hover {
    color: black;
  }

  [data-selected="true"] {
    color: black;
  }

  transition: all 0.1s ease-in-out;
`;

const SignupButton = styled(Button)`
  height: 35px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0 !important;

  ${props => media((props.theme as ThemeInterface).breakpoints[0], null)} {
    height: 25px;
    opacity: 1 !important;
  }

  ${props => media((props.theme as ThemeInterface).breakpoints[0], null)} {
    background-color: #fff;
    color: #2562ff;
  }
`;

const NavigationWrapper = styled(Flex)`
  height: 24px;

  ${props => media(null, (props.theme as ThemeInterface).breakpoints[0])} {
    display: none;
  }
`;

const ResponsiveMenu = styled(Flex)`
  display: none;

  ${props => media(null, (props.theme as ThemeInterface).breakpoints[0])} {
    display: flex;
  }
`;

const ResponsiveTitle = styled(Text)`
  letter-spacing: -0.035em;
  font-weight: 600;
  ${props => media(null, (props.theme as ThemeInterface).breakpoints[1])} {
    display: none;
  }
`;
