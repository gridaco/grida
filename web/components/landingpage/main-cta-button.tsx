import React from "react";
import { Button } from "rebass";
import { URLS } from "utils/landingpage/constants";

export default function LandingMainCtaButton() {
  const handleCta = () => {
    open(URLS.downloads.download_figma_plugin);
  };
  return (
    <Button mt={["32px", "90px", "90px", "90px"]} mb="50px" onClick={handleCta}>
      Start now
    </Button>
  );
}
