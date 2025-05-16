import React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "How does Grida Forms' pricing compare to other form builders?",
    answer:
      "Unlike other form builders that charge per submission or limit features based on response count, Grida Forms offers a fair, user-based pricing model. You get unlimited form submissions and all features included in the free tier until you reach 10,000+ Monthly Active Users. This means you can focus on growing your business without worrying about unexpected costs from high form submission volumes.",
  },
  {
    question:
      "How does Grida Forms ensure compliance with GDPR and other international privacy regulations?",
    answer:
      "Grida Forms is engineered with built-in privacy controls, automated consent management, and audit logging for full GDPR, CCPA, and global privacy law compliance. Each form submission explicitly tracks consent, provides data-portability exports, and ensures secure, encrypted storage. This simplifies your compliance process, reduces risk, and streamlines privacy audits.",
  },
  {
    question:
      "Can Grida Forms dynamically adapt form questions based on user behavior?",
    answer:
      "Yes. Grida Forms offers adaptive AI-powered form logic, which intelligently rearranges, skips, or emphasizes form questions in real-time based on user interactions, improving completion rates. The platform uses anonymized analytics to detect friction points and optimize form structure for conversions automatically.",
  },
  {
    question:
      "Is it possible to embed legally-binding e-signatures into Grida Forms?",
    answer:
      "Absolutely. Grida Forms integrates seamlessly with trusted e-signature providers, enabling forms to capture legally-binding signatures, timestamps, and audit trails securely. This makes Grida Forms ideal for industries like real estate, law, healthcare, and government services, ensuring every signed form meets legal standards.",
  },
  {
    question:
      "Does Grida Forms support seamless multi-language form creation and management?",
    answer:
      "Yes, Grida Forms provides built-in localization and multilingual form support. It integrates automatic translation tools and offers locale-specific field validation, enabling users globally to interact naturally with your forms. This ensures high-quality data collection and improved user experience across multiple regions.",
  },
  {
    question:
      "What makes Grida Forms particularly suitable for embedding into existing SaaS products?",
    answer:
      "Grida Forms offers a robust, developer-friendly API and embeddable SDK, designed specifically for integration into third-party SaaS platforms. Developers can easily create custom-branded form-building experiences, leveraging our backend infrastructure, real-time validations, and secure submissions. This enables SaaS products to offer reliable, scalable forms without extensive in-house development.",
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
