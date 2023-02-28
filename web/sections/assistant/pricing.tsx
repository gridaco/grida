import LandingpageText from "components/landingpage/text";
import PricingCard from "components/pricing-card";
import { useRouter } from "next/router";
import React from "react";
import { Flex } from "theme-ui";

export function PricingSection() {
  const router = useRouter();

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
      <Flex
        style={{
          flexDirection: "column",
          maxWidth: 400,
          textAlign: "center",
          gap: 16,
          marginBottom: 40,
        }}
      >
        <LandingpageText variant="h2">Pricing</LandingpageText>
        <p
          style={{
            maxWidth: 320,
            textAlign: "center",
          }}
        >
          *Assistant Earlybird aceess is only available to invited users at this
          moment.
        </p>
      </Flex>
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
            // move to invited page
            router.push("/assistant/invited#start");
            //
          }}
          action={"Start Free Trial"}
        />
      </div>
    </div>
  );
}
