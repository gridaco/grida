import React from "react";
import styled from "@emotion/styled";

export interface IShareMemberItem {
  profile: string;
  email: string;
  isEditor?: boolean;
}

const ShareMemberItem: React.FC<IShareMemberItem> = ({
  profile,
  email,
  isEditor,
}) => {
  return (
    <Container>
      <LeftSide>
        <Profile src={profile} />
        <Email>{email}</Email>
      </LeftSide>
      {isEditor ? (
        <Role>Editor</Role>
      ) : (
        <MoreIcon src="/assets/icons/mdi_more_horiz_round.svg" />
      )}
    </Container>
  );
};

export default ShareMemberItem;

const Container = styled.li`
  padding: 10px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const LeftSide = styled.div`
  display: flex;
  align-items: center;
`;

const Profile = styled.img`
  width: 36px;
  height: 36px;
  border-radius: 50%;
  margin-right: 12px;
  user-select: none;
  -webkit-user-drag: none;
`;

const Email = styled.span`
  font-weight: normal;
  font-size: 14px;
  line-height: 1.2;
  color: #000000;
`;

const Role = styled.span`
  font-weight: 500;
  font-size: 14px;
  line-height: 1.2;
  color: #151617;
`;

const MoreIcon = styled.img`
  width: 24px;
  height: 24px;
  cursor: pointer;
  user-select: none;
  -webkit-user-drag: none;
`;
