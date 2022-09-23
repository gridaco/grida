import PageHead from "components/page-head";
import React from "react";
import Sections from "sections/globalization";
import { getPageTranslations } from "utils/i18n";
import PAGES from "utils/seo/pages";

export default function GlobalizationPage() {
  return (
    <div>
      <PageHead type="data" {...PAGES.globalization} />
      <Sections.Hero />
      <Sections.Section2_quickd_demo_say_hi />
      <Sections.Section3_unlimit_your />
      <Sections.FeatureListup />
      <Sections.FAQs />
      <Sections.CTA />
    </div>
  );
}

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await getPageTranslations(locale)),
    },
  };
}
