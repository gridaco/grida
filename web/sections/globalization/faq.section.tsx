import FAQs from "components/faq";
import { FaqDisplayData } from "components/faq/interface";
import SectionLayout from "layout/section";
import React from "react";

const GLOBALIZATION_QUESTIONS: FaqDisplayData = [
  {
    query: "Is it suited for non design based text translation?",
    answer: "TBD",
  },
  {
    query:
      "How can i import exsisting project such from Google Sheets or Lokalise?",
    answer: "TBD",
  },
  {
    query:
      "My application must have super low-latency. Does it provide multi-regional edge network?",
    answer: "TBD",
  },
];

export default function SectionFaq() {
  return (
    <SectionLayout alignContent="center">
      <FAQs questions={GLOBALIZATION_QUESTIONS} />;
    </SectionLayout>
  );
}
