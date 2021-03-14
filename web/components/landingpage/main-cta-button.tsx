import styled from "@emotion/styled";
import React from "react";
import { Button } from "rebass";
import { URLS } from "utils/landingpage/constants";

export default function LandingMainCtaButton() {
  const handleCta = () => {
    open(URLS.downloads.download_figma_plugin);
  };
  return (
    <MainButton
      mt={["24px", "24px", "40px", "40px"]}
      mb={["134px", "84px", "100px", "145px"]}
      onClick={handleCta}
    >
      Start now
    </MainButton>
  );
}

const MainButton = styled(Button)`
  font-size: 17.5px;
  line-height: 22px;
  letter-spacing: 0.02em;
`;
