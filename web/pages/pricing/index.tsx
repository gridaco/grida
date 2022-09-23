import React from "react";

import PageHead from "components/page-head";
import Sections from "sections/pricing";
import PAGES from "utils/seo/pages";
import { getPageTranslations } from "utils/i18n";

export default function PricingPage() {
  return (
    <>
      <PageHead type="data" {...PAGES.pricing} />
      <Sections.Hero_TryFreePlan />
      <Sections.ComparePlans />
      <Sections.FeaturesAndPricingTable />
      {/* <Sections.FAQs /> */}
    </>
  );
}

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await getPageTranslations(locale, "pricing")),
    },
  };
}
