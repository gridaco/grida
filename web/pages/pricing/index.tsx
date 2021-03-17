import Head from "next/head";
import React from "react";

import Sections from "sections/pricing";
export default function PricingPage() {
  return (
    <>
    <Head>
      <title>Pricing - Bridged</title>
    </Head>
      <Sections.Hero_TryFreePlan />
      <Sections.ComparePlans />
      <Sections.FeaturesAndPricingTable />
      <Sections.FAQs />
    </>
  );
}
