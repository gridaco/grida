import React, { useState } from "react";
import styled from "@emotion/styled";
import { Flex, Text } from "theme-ui";
import Icon from "components/icon";
import { FaqQnaItem } from "./interface";

export default function QuestionItem(props: { question: FaqQnaItem }) {
  const { question } = props;
  const [isOpen, setIsOpen] = useState(false);

  const handleQueryHeaderClick = () => {
    setIsOpen(!isOpen);
  };

  return (
    <Flex
      style={{
        flexDirection: "column",
      }}
    >
      <Flex
        className="cursor"
        style={{
          width: "100%",
          alignItems: "center",
          justifyContent: "space-between",
        }}
        mb={["40px", "36px", "36px", "28px"]}
        onClick={handleQueryHeaderClick}
      >
        <Query mr={["51px", 0, 0, 0]}>{question.query}</Query>
        <Flex
          style={{
            width: "24px",
            height: "24px",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={isOpen ? "faqClose" : "plus"} className="cursor" />
        </Flex>
      </Flex>
      {isOpen && (
        <Answer
          style={{
            width: "95%",
          }}
          mb={["89px", "39px", "43px", "48px"]}
        >
          {question.answer}
        </Answer>
      )}
    </Flex>
  );
}

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
