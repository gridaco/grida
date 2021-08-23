import React from "react";
import styled from "@emotion/styled";
import { Modal } from "@material-ui/core";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  copyLink: string;
}

export function ShareModalContents(props: Props) {
  return (
    <Modal open={props.isOpen} onClose={props.onClose}>
      <Wrapper>
        <Row>
          <Title>Share to web</Title>
        </Row>
        <SubTitle>
          Anyone with the link can view this
          <br />
          scene
        </SubTitle>
        <p>{props.copyLink}</p>
      </Wrapper>
    </Modal>
  );
}

const Wrapper = styled.div`
  width: 395px;
  height: 222px;
  background: #fdfdfd;
  padding: 28px 29px;
  box-shadow: 0px 4px 32px rgba(0, 0, 0, 0.25), 0px 0px 2px rgba(0, 0, 0, 0.25);
  border-radius: 2px;
  position: absolute;
  top: 56px;
  right: 52px;
`;

const Row = styled.div`
  display: flex;
  flex-direction: row;
`;

const Title = styled.h1`
  margin: 0;
  font-weight: 500;
  font-size: 14px;
  line-height: 17px;
  color: #000000;
  margin-bottom: 10px;
`;

const SubTitle = styled.h6`
  margin: 0;
  font-weight: normal;
  font-size: 12px;
  line-height: 14px;
  color: #929292;
`;
