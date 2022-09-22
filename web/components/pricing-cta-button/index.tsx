import React from "react";
import { Button, ButtonProps } from "theme-ui";
import { LandingpageUrls } from "utils/landingpage/constants";

function PricingCTAButton(props: ButtonProps) {
  const handleSignupClick = () => {
    window.location.href = LandingpageUrls.signup_with_return;
  };

  return (
    <Button className="cursor" onClick={handleSignupClick} {...props}>
      Start now
    </Button>
  );
}

export default PricingCTAButton;
