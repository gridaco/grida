import React from "react";
import Link from "next/link";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs: { question: string; answer: React.ReactNode }[] = [
  {
    question: "How do AI credits work?",
    answer: (
      <>
        Each plan includes a monthly AI credit — $0.50 on Free,{" "}
        <strong>$10 per seat</strong> on Pro, <strong>$35 per seat</strong> on
        Team. AI features draw from this balance at the model provider&apos;s
        cost; we never mark up AI usage. Unused monthly credit resets at the
        start of the next billing period.{" "}
        <Link
          href="/docs/platform/billing"
          className="underline underline-offset-4"
        >
          Read the full guide
        </Link>
        .
      </>
    ),
  },
  {
    question: "What's the difference between Pro and Team?",
    answer:
      "Both are per-seat and both pool AI credit at the org level. Team raises the per-seat AI credit ($35 vs $10), storage, and monthly active users on published projects, and adds chat support. Pro is for individuals and small teams with lighter AI usage; Team is for teams that lean heavily on AI. You can switch between them any time — Stripe prorates the difference automatically.",
  },
  {
    question: "Can I buy credit ahead of time?",
    answer:
      "Yes. You can top up at any time, in any amount from $5 to $1000. The amount you pick is exactly what lands in your balance — the card processor's fee is added on top of the charge and shown clearly at checkout. Top-up credit never expires, even if you cancel and come back later.",
  },
  {
    question: "What happens when I run out of credit?",
    answer:
      "AI features pause until your monthly credit refreshes or you top up. Saving, editing, exporting — everything else in Grida keeps working. We never charge your card automatically to cover an AI call.",
  },
  {
    question: "Are AI prices marked up?",
    answer:
      "No. We charge you exactly what the model provider charges us. Our margin lives in the per-seat base price (the part of the seat that isn't AI credit), not in AI usage. When provider prices change, we update what we charge to match.",
  },
  {
    question: "What happens if I cancel?",
    answer:
      "You keep your plan and the current month's credit until the end of the period you've already paid for. After that, you switch to Free and start receiving $0.50 of credit each month. Any top-up credit you have stays in your account.",
  },
  {
    question: "How does pricing work for teams?",
    answer:
      "Pro and Team are both per-seat. Every member of your org is a seat, including the owner — pending invites don't count until accepted. Adding a member adds a seat (prorated for the rest of the period); removing one credits the next invoice. AI credit is pooled at the org level, so anyone on the team can spend any of it. A 5-seat Team org pays $300/month and gets a $175/month shared AI pool.",
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
        For the full breakdown — examples, edge cases, and policies — see the{" "}
        <Link
          href="/docs/platform/billing"
          className="underline underline-offset-4 text-foreground"
        >
          billing guide
        </Link>
        .
      </p>
    </div>
  );
}
