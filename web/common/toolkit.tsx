import {
  Hero,
  DesignToCode,
  OnlineApp,
  LayoutDetect,
  Products,
  Collaborate,
  Slogan,
} from "sections/bridged";

import { FreePlan, PlanList, FeatureList, Faq } from "sections/pricing";

export const BridgedSection = [
  { content: () => <Hero key="Hero-section" /> },
  {
    content: isMobile => (
      <OnlineApp key="OnlineApp-section" isMobile={isMobile} />
    ),
  },
  { content: () => <LayoutDetect key="LayoutDetect-section" /> },
  { content: () => <Products key="Products-section" /> },
  { content: () => <Collaborate key="Collaborate-section" /> },
  { content: () => <Slogan key="Slogan-section" /> },
];

export const PricingSection = [
  { content: () => <FreePlan key="FreePlan-section" /> },
  { content: () => <PlanList key="PlanList-section" /> },
  { content: () => <FeatureList key="FeatureList-section" /> },
  { content: () => <Faq key="Faq-section" /> },
  { content: () => <Slogan key="Slogan-section" /> },
];
