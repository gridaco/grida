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

import ExpandHeaderItem from "./expand-header-item";
import { HeaderMap } from "./headermap";

const Header = () => {
  const [currentExpandHeader, setCurrentExpandHeader] = useState("");
  const [isOpenMenu, setIsOpenMenu] = useState(false);
  const [currentRouter, setCurrentRouter] = useState("");
  const loginstate = useAuthState();
  const router = useRouter();
  useEffect(() => {
    if (isOpenMenu) {
      document.getElementsByTagName("html")[0].style.overflowY = "hidden";
    } else {
      document.getElementsByTagName("html")[0].style.overflowY = "auto";
    }
  }, [isOpenMenu]);

  const handleClickMenu = useCallback(() => setIsOpenMenu(!isOpenMenu), [
    isOpenMenu,
  ]);

  const onClickExpandHeader = useCallback(
    (title: string) => setCurrentExpandHeader(title),
    [],
  );

  const handleSignupClick = () => {
    if (loginstate == "signedin") {
      window.location.href = URLS.landing.app;
    } else {
      window.location.href = URLS.landing.signup_with_return;
    }
  };

  const handleSigninOrMoveAppClick = () => {
    if (loginstate == "signedin") {
      // move to app
      window.location.href = URLS.landing.app;
    } else {
      !isOpenMenu && (window.location.href = URLS.landing.signin_with_return);
    }
  };

  useEffect(() => {
    setCurrentRouter(router.asPath);

    if (currentRouter != router.asPath && currentRouter != "") {
      setIsOpenMenu(false);
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
          <Icon name={isOpenMenu ? "headerClose" : "headerMenu"} />
        </ResponsiveMenu>

        <Flex alignItems="center">
          <Link href="/">
            <Bridged
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
            {HeaderMap.map(i =>
              !i.href ? (
                <ExpandHeaderItem
                  type="desktop"
                  key={i.label}
                  item={i}
                  isExpand={currentExpandHeader === i.label}
                  onExpandHeader={() => onClickExpandHeader(i.label)}
                  onContractHeader={() => onClickExpandHeader("")}
                />
              ) : (
                <Link href={i.href} key={i.label}>
                  <Item
                    onClick={() => {
                      // log header menu click event
                      event_click_header_menu({ menu: i.label });
                    }}
                    onMouseOver={() => onClickExpandHeader("")}
                    className="cursor"
                    mx="12px"
                    color={currentRouter === i.href ? "#000" : "#888"}
                    fontWeight="bold"
                    fontSize="16px"
                  >
                    {i.label}
                  </Item>
                </Link>
              ),
            )}
          </NavigationWrapper>
        </Flex>

        <SignupButton
          onClick={handleSignupClick}
          style={{ opacity: isOpenMenu && 0 }}
          fontSize={["13px", "13px", "15px"]}
          p={["6px 10px", "6px 10px", "9px 20px", "9px 20px"]}
          variant="noShadow"
        >
          {loginstate == "signedin" ? "Go to App" : "Sign up"}
        </SignupButton>
      </Flex>

      {isOpenMenu && (
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
            {HeaderMap.map(i =>
              !i.href ? (
                <ExpandHeaderItem
                  key={i.label}
                  type="mobile"
                  item={i}
                  isExpand={currentExpandHeader === i.label}
                  onExpandHeader={() => onClickExpandHeader(i.label)}
                  onContractHeader={() => onClickExpandHeader("")}
                />
              ) : (
                <Link href={i.href} key={i.label}>
                  <Item
                    className="cursor"
                    my="12px"
                    color={currentRouter === i.href ? "#000" : "#888"}
                    fontWeight="bold"
                    fontSize="16px"
                  >
                    {i.label}
                  </Item>
                </Link>
              ),
            )}
          </Flex>

          <Box>
            <Button
              variant="noShadow"
              width="100%"
              bg="#2562FF"
              height="35px"
              fontSize="13px"
              mb="12px"
              disabled={loginstate == "signedin"}
              style={{
                opacity: (loginstate == "signedin") != null ? 0 : 1,
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
              {loginstate == "signedin" ? (
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
  );
};

export default Header;

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

const Bridged = styled(Icon)`
  ${props => media(null, (props.theme as ThemeInterface).breakpoints[0])} {
    position: absolute;
  }
`;

const Item = styled(Text)`
  font-weight: 500;
  letter-spacing: 0em;

  &:hover {
    color: #000;
  }
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
