import { PricingSection } from "common/toolkit";
import React from "react";

export default function PricingPage() {
  return <>{PricingSection.map(item => item.content())}</>;
}
