import PricingCard from "components/pricing-card";
import React from "react";

export function PricingSection() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        padding: "40px",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <h1>Pricing</h1>
      <div>
        <PricingCard
          features={[
            "7 Day free trial",
            "AI Copywriter",
            "AI Text to Image",
            "10,000+ Icons",
            "1M+ Images",
            "Design Lint",
            "Publish as website",
            "Many more in Toolbox",
          ]}
          name={""}
          normal={15}
          price={9}
          onStart={() => {
            //
          }}
          action={"Start Free Trial"}
        />
      </div>
    </div>
  );
}
