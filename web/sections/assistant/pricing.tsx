import styled from "@emotion/styled";
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
      <div
        style={{
          marginTop: 40,
        }}
      >
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
          highlight
          description={<SpecialBadge>Early bird offer - Save 40%</SpecialBadge>}
          normal={15}
          unitDescription={"per month"}
          price={9}
          onStart={() => {
            // move to invited page
            router.push("/assistant/invited#start");
            //
          }}
          action={"Start Free Trial"}
          style={{
            minWidth: 360,
          }}
        />
      </div>
    </div>
  );
}

const SpecialBadge = styled.div`
  margin: 8px 0;
  align-self: flex-start;
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: flex-start;
  flex: none;
  gap: 10px;
  border-radius: 8px;
  background-color: rgba(37, 98, 255, 0.16);
  box-sizing: border-box;
  padding: 10px;

  /* text */
  color: rgb(37, 98, 255);
  font-size: 14px;
  font-family: Inter, sans-serif;
  font-weight: 800;
`;
