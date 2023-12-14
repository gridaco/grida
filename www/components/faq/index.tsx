import React from "react";
import styled from "@emotion/styled";
import { Flex, Heading } from "theme-ui";
import SectionLayout from "layouts/section";
import Question from "./question-item";
import BlankArea from "components/blank-area";
import { FaqDisplayData } from "./interface";

export default function FAQs(props: { questions: FaqDisplayData }) {
  return (
    <SectionLayout>
      <Flex
        style={{
          flexDirection: "column",
          width: "100%",
        }}
      >
        <TitleText>FAQs</TitleText>
        <Wrapper
          style={{
            flexDirection: "column",
            width: "100%",
          }}
        >
          {props.questions.map((item, ix) => (
            <Question question={item} key={ix} />
          ))}
        </Wrapper>
      </Flex>
      <BlankArea height={[135, 170]} />
    </SectionLayout>
  );
}

const TitleText = styled(Heading)`
  font-size: 48px;
  color: #000000;
  letter-spacing: 0em;
`;

const Wrapper = styled(Flex)`
  margin-top: 62px;
`;
