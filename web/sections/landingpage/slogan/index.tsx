import styled from "@emotion/styled";
import SectionLayout from "layouts/section";
import React from "react";
import { Button, Flex } from "theme-ui";

import Icon from "components/icon";
import LandingMainCtaButton from "components/landingpage/main-cta-button";
import LandingpageText from "components/landingpage/text";
import { useTranslation } from "next-i18next";
import { media } from "utils/styled/media";
import { useRouter } from "next/router";

const Slogan = () => {
  const router = useRouter();
  const { t } = useTranslation("page-index", {
    keyPrefix: "section/final-cta",
  });
  const { t: t_common } = useTranslation();
  return (
    <SectionLayout
      variant="full-width"
      alignContent="center"
      backgroundColor="#000"
    >
      <Flex
        my={["120px", "300px"]}
        style={{
          zIndex: 5,
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <SloganText variant="h2">{t("heading.focus")}</SloganText>
        <SloganText variant="h2">
          <Icon
            name="grida_black"
            width={[32, 64]}
            height={[32, 64]}
            isVerticalMiddle
            mr={[12, 28]}
          />
          {t("heading.do-the-rest")}
        </SloganText>
        <CTAArea
          mt={["24px", "24px", "40px", "40px"]}
          mb={["134px", "84px", "100px", "145px"]}
        >
          <LandingMainCtaButton />
          <ContactSalesButton
            onClick={() => {
              // router.push("/contact/sales");
              router.push("https://calendly.com/universe-at-grida/meet-grida");
            }}
          >
            {t_common("book-a-demo")}
          </ContactSalesButton>
        </CTAArea>
      </Flex>
    </SectionLayout>
  );
};

export default Slogan;

const SloganText = styled(LandingpageText)`
  color: #fff;
  text-align: center;
  path {
    fill: #fff;
  }
  letter-spacing: -0.03em;
`;

const CTAArea = styled(Flex)`
  flex-direction: row;
  justify-content: center;
  align-items: center;
  gap: 24px;

  ${props => media(null, props.theme.breakpoints[0])} {
    flex-direction: column;
    gap: 16px;
  }
`;

const ContactSalesButton = styled(Button)`
  cursor: pointer;
  border-radius: 100px !important;
  padding: 12px 28px !important;
  font-weight: 500;
  font-size: 17.5px;
  line-height: 22px;
  letter-spacing: 0.02em;
  color: white;
  background-color: transparent;
  box-shadow: 0px 4px 16px rgba(0, 0, 0, 0.12);

  &:hover {
    background-color: rgba(255, 255, 255, 0.22);
  }

  transition: all 0.2s ease-in-out;
`;
