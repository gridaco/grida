import React from "react";

import Sections from "sections/pricing";
export default function PricingPage() {
  return (
    <>
      <Sections.Hero_TryFreePlan />
      <Sections.ComparePlans />
      <Sections.FeaturesAndPricingTable />
      <Sections.FAQs />
    </>
  );
}
