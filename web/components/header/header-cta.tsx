import React from "react";
import styled from "@emotion/styled";
import { media } from "utils/styled/media";
import { useAuthState } from "utils/hooks/use-auth-state";
import { URLS } from "utils/landingpage/constants";
import { center, pointer } from "utils/styled/styles";
import { Box, Button } from "theme-ui";
import Icon from "components/icon";
import { useTheme } from "@emotion/react";
import { useTranslation } from "next-i18next";

export function HeaderCta({
  mobile,
  isMobileMenuOpen,
}: {
  mobile?: boolean;
  isMobileMenuOpen?: boolean;
}) {
  const auth = useAuthState();
  const theme = useTheme();
  const { t } = useTranslation("header");

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
      window.location.href = URLS.landing.signin_with_return;
    }
  };
  if (mobile) {
    return (
      <Box>
        <Button
          variant="noShadow"
          bg={theme.header.accent}
          mb="12px"
          disabled={auth == "signedin"}
          style={{
            width: "100%",
            height: "35px",
            fontSize: "13px",
            opacity: (auth == "signedin") != null ? 0 : 1,
          }}
          onClick={handleSignupClick}
        >
          {t("sign-up")}
        </Button>
        <Button
          variant="noShadow"
          color={theme.header.color}
          backgroundColor="transparent"
          style={{
            ...center,
            ...pointer,
            width: "100%",
            height: "35px",
            fontSize: "13px",
            fontWeight: 500,
          }}
          onClick={handleSigninOrMoveAppClick}
        >
          {auth == "signedin" ? (
            t("cta-go-to-app")
          ) : (
            <React.Fragment>
              <Icon name="lock" isVerticalMiddle mr="6px" />
              {t("sign-in")}
            </React.Fragment>
          )}
        </Button>
      </Box>
    );
  }

  return (
    <SignupButton
      style={{ opacity: isMobileMenuOpen ? "hidden" : "visible" }}
      onClick={handleSignupClick}
      sx={{
        fontSize: ["14px", "14px", "15px"],
      }}
      p={["6px 10px", "6px 10px", "9px 20px", "9px 20px"]}
      variant="noShadow"
    >
      {auth == "signedin" ? t("cta-go-to-app") : t("common:sign-up")}
    </SignupButton>
  );
}

const SignupButton = styled(Button)`
  font-weight: 500 !important;
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
