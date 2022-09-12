import React from "react";
import { Button } from "rebass";
import { LandingpageUrls } from "utils/landingpage/constants";

function PricingCTAButton(props) {
  const { ...style } = props;

  const handleSignupClick = () => {
    window.location.href = LandingpageUrls.signup_with_return;
  };

  return (
    <Button className="cursor" onClick={handleSignupClick} {...style}>
      Start now
    </Button>
  );
}

export default PricingCTAButton;
