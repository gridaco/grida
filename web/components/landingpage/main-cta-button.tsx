import styled from "@emotion/styled";
import React from "react";
import { Button, Box } from "rebass";
import { motion } from "framer-motion";
import { URLS } from "utils/landingpage/constants";

export default function LandingMainCtaButton() {
  const handleCta = () => {
    open(URLS.downloads.download_figma_plugin);
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
