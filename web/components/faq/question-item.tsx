import React, { useState } from "react";
import styled from "@emotion/styled";
import { Flex, Text } from "rebass";
import Icon from "components/icon";
import { FaqQnaItem } from "./interface";

export default function QuestionItem(props: { question: FaqQnaItem }) {
  const { question } = props;
  const [isOpen, setIsOpen] = useState(false);

  const handleQueryHeaderClick = () => {
    setIsOpen(!isOpen);
  };

  return (
    <Flex flexDirection="column">
      <QueryHeader
        width="100%"
        height="32px"
        alignItems="center"
        justifyContent="space-between"
        mb={["40px", "36px", "36px", "28px"]}
        onClick={handleQueryHeaderClick}
      >
        <Query mr={["51px", 0, 0, 0]}>{question.query}</Query>
        <Icon
          name={isOpen ? "faqClose" : "plus"}
          className="cursor"
          mr={!isOpen ? "9px" : "0px"}
        />
      </QueryHeader>
      {isOpen && (
        <Answer width="95%" mb={["89px", "39px", "43px", "48px"]}>
          {question.answer}
        </Answer>
      )}
    </Flex>
  );
}

const QueryHeader = styled(Flex)`
  cursor: pointer;
`;

const Query = styled(Text)`
  font-size: 20px;
  letter-spacing: 0em;
  text-align: left;
`;

const Answer = styled(Flex)`
  font-size: 20px;
  line-height: 133%;

  color: #3d3d3d;

  letter-spacing: 0em;
  text-align: left;
`;
