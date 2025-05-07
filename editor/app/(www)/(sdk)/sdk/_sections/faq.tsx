import React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "What is Grida Canvas SDK?",
    answer:
      "Grida Canvas SDK is an open-source, TypeScript-first canvas framework that allows developers to build custom canvas experiences. It provides powerful tools and utilities for creating interactive canvas applications with high performance and flexibility.",
  },
  {
    question: "Is Grida Canvas SDK free to use?",
    answer:
      "Yes, Grida Canvas SDK is completely open-source and free to use. You can use it in both personal and commercial projects under the Apache 2.0 license.",
  },
  {
    question: "What are the main features of Grida Canvas SDK?",
    answer:
      "Grida Canvas SDK offers features like real-time collaboration, high-performance rendering, TypeScript support, customizable components, and a rich set of tools for canvas manipulation and interaction.",
  },
  {
    question: "Can I use Grida Canvas SDK with React?",
    answer:
      "Yes, Grida Canvas SDK is fully compatible with React and provides React-specific components and hooks for seamless integration into React applications.",
  },
  {
    question: "How do I get started with Grida Canvas SDK?",
    answer:
      "You can get started by installing the starter-kit, and following our comprehensive documentation. We also provide example projects and tutorials to help you get up and running quickly.",
  },
  {
    question: "Do I need to subscribe to use Grida Canvas SDK?",
    answer:
      "No, Grida Canvas SDK is completely free to use. However, we also provide Backend-as-a-Service for your canvas app. This includes document cloud, CDN, and real-time collaboration.",
  },
  {
    question: "What Graphics Backend do you use?",
    answer:
      "We use DOM / SVG / HTML / CSS as our primary graphics backend. This will give you 100% compatibility with the web standards.",
  },
  {
    question:
      "Does Grida Canvas SDK support WebGL / WebGPU (Accelerated Graphics)?",
    answer:
      "Not yet, but some of our components are built on top of WebGPU, and we are gradually adding more.",
  },
];

export default function FAQ() {
  return (
    <div className="w-full max-w-3xl mx-auto">
      <h2 className="text-4xl font-bold text-center mb-8">
        Frequently Asked Questions
      </h2>
      <Accordion type="multiple" className="w-full">
        {faqs.map((faq, index) => (
          <AccordionItem key={index} value={`item-${index}`}>
            <AccordionTrigger className="text-left text-lg">
              {faq.question}
            </AccordionTrigger>
            <AccordionContent className="text-base text-muted-foreground">
              {faq.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
