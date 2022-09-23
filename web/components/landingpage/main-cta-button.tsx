import styled from "@emotion/styled";
import { motion } from "framer-motion";
import { useTranslation } from "next-i18next";
import { useRouter } from "next/router";
import React from "react";
import { Button, Box } from "theme-ui";

import { useAuthState } from "utils/hooks/use-auth-state";
import { URLS } from "utils/landingpage/constants";

export default function LandingMainCtaButton() {
  const { t } = useTranslation();
  const loginstate = useAuthState();
  const router = useRouter();

  const handleCta = () => {
    switch (loginstate) {
      case "expired":
      case "unauthorized":
      case "loading": // loading also fallbacks as singup since there is no better way to handle this is ux perspective. - althoug, we will have enough time for the authstate from remote to bn loaded.
        router.push(URLS.landing.signup_with_return);
        break;
      case "signedin":
        router.push("/docs", "/docs", {
          // TODO: disable explicit locale once docs locale resolution is fixed.
          locale: "en",
        });
        break;
    }
  };
  return (
    <Box
      mt={["24px", "24px", "40px", "40px"]}
      mb={["134px", "84px", "100px", "145px"]}
    >
      <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
        <MainButton onClick={handleCta}>{t("start-now")}</MainButton>
      </motion.div>
    </Box>
  );
}

const MainButton = styled(Button)`
  cursor: pointer;
  border-radius: 100px !important;
  padding: 12px 28px !important;
  font-weight: 500;
  font-size: 17.5px;
  line-height: 22px;
  letter-spacing: 0.02em;
  background-color: ${p => p.theme.colors.primary};
  box-shadow: 0px 4px 16px rgba(0, 0, 0, 0.12);
`;
