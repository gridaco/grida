// GRIDA-EE: billing — customer-facing pricing and billing questions.

import React from "react";
import Link from "next/link";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@app/ui/components/accordion";

const faqs: { question: string; answer: React.ReactNode }[] = [
  {
    question: "Is Grida really free?",
    answer:
      "Yes. Grida is free to use, with no subscription and every product feature included. That includes Grida Desktop, the Canvas editor, Forms, Database/CMS, and Figma import.",
  },
  {
    question: "Is Grida open source?",
    answer: (
      <>
        Yes. Grida is developed in the open under the Apache 2.0 license. The
        source code is on{" "}
        <Link
          href="https://github.com/gridaco/grida"
          className="underline underline-offset-4 text-foreground"
        >
          GitHub
        </Link>
        .
      </>
    ),
  },
  {
    question: "What do I pay for?",
    answer:
      "Only Grida-hosted AI. Hosted models use prepaid AI credit, which you can buy as needed in amounts from $10 to $500. Credit is shared across your organization.",
  },
  {
    question: "Can I use AI without buying credit?",
    answer:
      "Yes. Bring your own provider keys or connect local models with Ollama. Those requests do not use Grida AI credit.",
  },
  {
    question: "What is a Custom plan?",
    answer:
      "Custom plans are arranged directly with Grida for organizations that need tailored terms, deployment, integrations, or support. Contact us to discuss your requirements.",
  },
];

export default function PricingFAQ() {
  return (
    <div className="w-full max-w-3xl mx-auto">
      <h2 className="text-4xl font-semibold text-center mb-8">
        Frequently asked questions
      </h2>
      <Accordion type="multiple" className="w-full">
        {faqs.map((faq, index) => (
          <AccordionItem key={index} value={`item-${index}`}>
            <AccordionTrigger>{faq.question}</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              {faq.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <p className="text-center text-sm text-muted-foreground mt-12">
        For more information about AI credit and billing, see the{" "}
        <Link
          href="https://grida.co/docs/platform/billing"
          className="underline underline-offset-4 text-foreground"
        >
          billing guide
        </Link>
        .
      </p>
    </div>
  );
}
