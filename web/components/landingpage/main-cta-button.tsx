import styled from "@emotion/styled";
import { motion } from "framer-motion";
import React from "react";
import { Button, Box } from "rebass";

import { useLoginState } from "utils/hooks/use-auth-state";
import { URLS } from "utils/landingpage/constants";

export default function LandingMainCtaButton() {
  const loginstate = useLoginState();

  const handleCta = () => {
    switch (loginstate) {
      case "expired":
      case "unauthorized":
      case "loading": // loading also fallbacks as singup since there is no better way to handle this is ux perspective. - althoug, we will have enough time for the authstate from remote to bn loaded.
        window.location.href = URLS.landing.signup_with_return;
      case "signedin":
        window.location.href = "/docs/getting-started";
        break;
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
