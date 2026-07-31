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
    question: "Which plans are available?",
    answer:
      "Grida offers Free, Pro, and Custom plans. Free costs $0, Pro costs $20 per month, and Custom plans use bespoke commercial terms.",
  },
  {
    question: "How is Pro billed?",
    answer: "Pro is billed monthly at $20 per organization.",
  },
  {
    question: "Does a plan include AI credit?",
    answer:
      "No. AI credit is purchased separately. Pro adds automatic credit reload so an organization can keep working without manual top-ups.",
  },
  {
    question: "How do I upgrade to Pro?",
    answer:
      "Choose Upgrade to Pro, select your organization, and complete checkout from its billing settings.",
  },
  {
    question: "What is a Custom plan?",
    answer:
      "Custom plans are arranged directly with Grida for organizations that need tailored commercial terms. Contact us to discuss your requirements.",
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
        For more information about managing your subscription, see the{" "}
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
