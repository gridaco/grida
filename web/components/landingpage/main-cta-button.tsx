import styled from "@emotion/styled";
import React from "react";
import { Button, Box } from "rebass";
import { motion } from "framer-motion";
import { URLS } from "utils/landingpage/constants";
import { useCookies } from "react-cookie";

/**
 * DO NOT CHANGE KEY - this key is set by accounts.bridged.xyz
 * @todo - change key value. the key value is not managed and Ambiguous.
 */
const COOKIE_ACCESS_TOKEN_KEY = "_token";

export default function LandingMainCtaButton() {
  const [cookie] = useCookies([COOKIE_ACCESS_TOKEN_KEY]);
  const handleCta = () => {
    if (cookie[COOKIE_ACCESS_TOKEN_KEY] != null) {
      window.location.href = "/docs/getting-started";
    } else {
      window.location.href = URLS.landing.signup_with_return;
    }
  };
  return (
    <Box
      mt={["24px", "24px", "40px", "40px"]}
      mb={["134px", "84px", "100px", "145px"]}
    >
      <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
        <MainButton onClick={handleCta}>Start now</MainButton>
      </motion.div>
    </Box>
  );
}

const MainButton = styled(Button)`
  font-size: 17.5px;
  line-height: 22px;
  letter-spacing: 0.02em;
`;
