import Button from "components/mdx/button";
import React from "react";
import { LandingpageUrls } from "utils/landingpage/constants";

function PricingCTAButton(props) {
  const { ...style } = props;

  const handleSignupClick = () => {
    window.location.href = LandingpageUrls.signup;
  };

  return (
    <Button className="cursor" onClick={handleSignupClick} {...style}>
      Start now
    </Button>
  );
}

export default PricingCTAButton;
