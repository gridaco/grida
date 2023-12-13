import React from "react";
import { FaqQnaItem } from "components/faq/interface";
import FAQs from "components/faq";

const PRICING_FAQ_LIST: FaqQnaItem[] = [
  {
    query: "How do Grida make money?",
    answer: "TBD",
  },
  {
    query: "What are the limitations with free plan?",
    answer: "TBD",
  },
  {
    query: "I cannot see images anymore. What happened?",
    answer:
      "Your image is uploaded and hosted on Grida cloud for 24 hours for development mode. If you enable publishing option for the screen / component you selected, all the resources will be long-lived. long-lived resource hosting is only available for paid plan. for free plan, we only support 24 hours temp hosting.",
  },
  {
    query: "How does the standard extra cloud usage fee calculated?",
    answer: "TBD",
  },
  {
    query: "Does Grida have explicit enterprise support plan?",
    answer: "TBD",
  },
];

export default function PricingFAQs() {
  return <FAQs questions={PRICING_FAQ_LIST} />;
}
