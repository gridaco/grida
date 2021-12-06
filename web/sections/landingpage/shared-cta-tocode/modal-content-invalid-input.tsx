import styled from "@emotion/styled";
import React from "react";

export function ModalInvalidInputContentBody() {
  return (
    <RootWrapperContentBody>
      <Spacer></Spacer>
      <Title>Woopsy.</Title>
      <Body>
        That’s not a valid figma design url.{" "}
        <u>
          <a
            href="https://grida.co/docs/with-figma/guides/how-to-get-sharable-design-link"
            target="_blank"
          >
            How do i get one?
          </a>
        </u>
      </Body>
    </RootWrapperContentBody>
  );
}

const RootWrapperContentBody = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: center;
  flex: none;
  gap: 48px;
  box-sizing: border-box;
`;

const Spacer = styled.div`
  width: 32px;
  height: 32px;
  background-color: rgba(255, 255, 255, 1);
`;

const Title = styled.span`
  color: rgba(46, 46, 46, 1);
  text-overflow: ellipsis;
  font-size: 36px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 700;
  line-height: 87%;
  text-align: center;
  align-self: stretch;
`;

const Body = styled.span`
  color: rgba(104, 104, 104, 1);
  text-overflow: ellipsis;
  font-size: 24px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  line-height: 141%;
  text-align: center;
  align-self: stretch;
`;
