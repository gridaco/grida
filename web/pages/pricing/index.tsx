import React from "react";

import PageHead from "components/page-head";
import Sections from "sections/pricing";
import PAGES from "utils/seo/pages";
export default function PricingPage() {
  return (
    <>
      <PageHead pageMeta={PAGES.pricing} />
      <Sections.Hero_TryFreePlan />
      <Sections.ComparePlans />
      <Sections.FeaturesAndPricingTable />
      {/* <Sections.FAQs /> */}
    </>
  );
}
