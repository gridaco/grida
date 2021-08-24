import React from "react";
import styled from "@emotion/styled";
import { Modal, Switch } from "@material-ui/core";
import { StyledButton } from "../top-bar/button-style";
import copy from "copy-to-clipboard";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  copyLink: string;
  isPublic: boolean;
  publicContorl: () => void;
}

function onClickCopyLink() {
  copy(window.location.href);
  alert("Copied to clipboard!");
}

export function ShareModalContents(props: Props) {
  return (
    <Modal open={props.isOpen} onClose={props.onClose}>
      <Wrapper>
        <Row>
          <Title>Share to web</Title>

          <StyledSwitch
            checked={props.isPublic}
            onChange={props.publicContorl}
            color="default"
          />
        </Row>
        <SubTitle>
          Anyone with the link can view this
          <br />
          scene
        </SubTitle>
        <p>{props.copyLink}</p>
        <CopLink onClick={onClickCopyLink}>Copy</CopLink>
        <Row>
          <StyledHref href="/" target={"_blank"}>
            Learn about sharing
          </StyledHref>
          <CopLink onClick={onClickCopyLink}>Copy Link</CopLink>
        </Row>
      </Wrapper>
    </Modal>
  );
}

const Wrapper = styled.div`
  width: 395px;
  height: 222px;
  background: #fdfdfd;
  padding: 28px 29px;
  padding-top: 12px;
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
  margin-top: 12px;
  margin-bottom: 10px;
`;

const StyledSwitch = styled(Switch)`
  text-align: right;
  margin-left: auto;
`;

const SubTitle = styled.h6`
  margin: 0;
  font-weight: normal;
  font-size: 12px;
  line-height: 14px;
  color: #929292;
`;

const StyledHref = styled.a`
  font-style: normal;
  font-weight: normal;
  font-size: 12px;
  line-height: 14px;

  color: #000000;
  text-decoration: none;
`;

const CopLink = styled.button`
  font-size: 14px;
  border-radius: 4px;
  box-sizing: border-box;
  padding-top: 16px;
  padding-bottom: 16px;
  cursor: pointer;
  outline: none;
  border: 0;
  background: rgba(255, 255, 255, 0);
  margin-left: auto;
`;
