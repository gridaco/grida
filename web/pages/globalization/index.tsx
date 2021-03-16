import LandingpageText from "components/landingpage/text";
import React from "react";
import Sections from "sections/globalization";

export default function GlobalizationPage() {
  return (
    <div>
      <Sections.Hero />
      <Sections.Section2_quickd_demo_say_hi />
      <Sections.Section3_unlimit_your />
      <Sections.FAQs />
      <Sections.CTA />
    </div>
  );
}
