import React from "react";
import styled from "@emotion/styled";
import { Flex, Heading } from "rebass";
import SectionLayout from "layout/section";
import Question from "components/question";

interface FaqProps {
  list: string;
}

const questionList = [
  {
    title: "How do Bridged make money?",
  },
  {
    title: "What are the limitations with free plan?",
  },
  {
    title: "I cannot see images anymore. What happened?",
    desc:
      "Your image is uploaded and hosted on bridged cloud for 24 hours for development mode. If you enable publishing option for the screen / component you selected, all the resources will be long-lived. long-lived resource hosting is only available for paid plan. for free plan, we only support 24 hours temp hosting.",
  },
  {
    title: "How does the standard extra cloud usage fee calculated?",
  },
  {
    title: "Does bridged have explicit enterprise support plan?",
  },
];

const Faq: React.FC = () => {
  return (
    <SectionLayout>
      <Flex flexDirection="column" width="100%">
        <FreeText>FAQs</FreeText>
        <Wrapper flexDirection="column" width="100%">
          {questionList.map((item, ix) => (
            <Question list={item} key={ix} />
          ))}
        </Wrapper>
      </Flex>
    </SectionLayout>
  );
};

export default Faq;

const FreeText = styled(Heading)`
  font-size: 48px;
  color: #000000;

  letter-spacing: 0em;
`;

const Wrapper = styled(Flex)`
  margin-top: 62px;
`;
