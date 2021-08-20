import React from "react";
import styled from "@emotion/styled";

import Modal, { IModal } from "../atom.modal";
import ShareMemberItem, { IShareMemberItem } from "./share-member-item";
import { writeToClipboard } from "../../../utils/clipboard";

const exampleManagers: IShareMemberItem[] = [
  {
    profile: "/assets/examples/profile.png",
    email: "universe@grida.co",
    isEditor: true,
  },
  ...Array(8).fill({
    profile: "/assets/examples/profile.png",
    email: "pacman@grida.co",
  }),
];

interface IShareModal extends IModal {}

const ShareModal: React.FC<IShareModal> = ({ isOpen, onClose }) => {
  const onClickShareLink = () => {
    writeToClipboard(window.location.href);
    alert("Copied to clipboard!");
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <Container>
        <Header>
          <Title>Share</Title>
          <CloseIcon
            src="/assets/icons/mdi_close_round.svg"
            onClick={onClose}
          />
        </Header>
        <InviteWrapper>
          <InviteInput placeholder="Invite member with email" />
          <InviteButton>
            <span>+ Invite</span>
          </InviteButton>
        </InviteWrapper>
        <ListHeader>
          <div>
            <PeopleIcon src="/assets/icons/mdi_people_round.svg" />
            <ListTitle>Project Members</ListTitle>
          </div>
          <LinkShare onClick={onClickShareLink}>Shared Link</LinkShare>
        </ListHeader>
        <MemberList>
          {exampleManagers.map((managerInformation, managerIndex) => (
            <ShareMemberItem key={managerIndex} {...managerInformation} />
          ))}
        </MemberList>
      </Container>
    </Modal>
  );
};

export default ShareModal;

const Container = styled.div`
  background: #ffffff;
  border-radius: 16px;
  padding-bottom: 24px;
  width: 600px;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px;
  border-bottom: 1px solid #eeeeee;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 20px;
  line-height: 1.15;
  color: #000000;
`;

const CloseIcon = styled.img`
  width: 24px;
  height: 24px;
  cursor: pointer;
  user-select: none;
  -webkit-user-drag: none;
`;

const InviteWrapper = styled.div`
  padding: 24px;
  border-bottom: 1px solid #eeeeee;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const InviteInput = styled.input`
  background: #fafafa;
  border: 1px solid #e1e1e1;
  border-radius: 4px;
  padding: 12px;
  margin-right: 16px;
  flex: 1;

  &::placeholder {
    color: #9f9f9f;
  }

  &:active,
  &:focus {
    outline: 0;
  }
`;

const InviteButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  background: #151617;
  border-radius: 6px;
  padding: 12px;
  border: 0;
  cursor: pointer;

  span {
    font-weight: 500;
    font-size: 14px;
    line-height: 1.2;
    letter-spacing: 0.3px;
    color: #ffffff;
  }
`;

const ListHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px;
  padding-bottom: 16px;

  & > div {
    display: flex;
    align-items: center;
  }
`;

const PeopleIcon = styled.img`
  width: 20px;
  height: 20px;
  margin-right: 9px;
  user-select: none;
  -webkit-user-drag: none;
`;

const ListTitle = styled.h2`
  margin: 0;
  font-weight: normal;
  font-size: 14px;
  line-height: 1.2;
  color: #adaeb3;
`;

const LinkShare = styled.span`
  font-weight: bold;
  font-size: 14px;
  line-height: 1.2;
  color: #3491ff;
  cursor: pointer;
`;

const MemberList = styled.ul`
  margin: 0;
  padding: 0;
  list-style-type: none;
  max-height: 392px;
  overflow-y: scroll;
`;
