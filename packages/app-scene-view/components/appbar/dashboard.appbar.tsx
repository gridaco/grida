import React, { useState } from "react";
import Link from "next/link";
import styled from "@emotion/styled";
import ShareModal from "../modals/share";

import IconButton from "@app/scene-view/components/icon-button";

export interface IDashboardAppBar {
  logo?: JSX.Element | string;
  title?: string;
  backButton?: string;
  onClickShare?: () => void;
  onClickPlay?: () => void;
}

export default function DashboardAppbar({
  logo,
  title,
  backButton,
  onClickShare,
  onClickPlay,
}: IDashboardAppBar) {
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);

  const onClickOpenShare = () => setIsShareModalOpen(true);

  const onClickCloseShare = () => setIsShareModalOpen(false);

  return (
    <>
      <Container>
        <Link href="/">
          {!!backButton ? (
            <BackButton>
              <BackButtonIconImage src="/assets/icons/mdi_navigate_before.svg" />
              <span>{backButton}</span>
            </BackButton>
          ) : (
            <>
              {logo && (
                <>{typeof logo == "string" ? <LogoImage src={logo} /> : logo}</>
              )}
            </>
          )}
        </Link>
        {title && <Title>{title}</Title>}
        <Toolbar>
          <IconButton
            style={{
              marginRight: 17,
            }}
            onClick={onClickShare || onClickOpenShare}
          >
            <IconImage src="/assets/icons/mdi_ios_share.svg" />
          </IconButton>
          <IconButton onClick={onClickPlay}>
            <IconImage src="/assets/icons/mdi_play_arrow.svg" />
          </IconButton>
          <ProfileImage src="/assets/examples/profile.png" />
        </Toolbar>
      </Container>
      <ShareModal isOpen={isShareModalOpen} onClose={onClickCloseShare} />
    </>
  );
}

const Container = styled.header`
  background: #ffffff;
  box-shadow: 0px 2px 8px rgba(0, 0, 0, 0.12);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1;
`;

const BackButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background-color: transparent;
  cursor: pointer;

  span {
    font-weight: bold;
    font-size: 14px;
    line-height: 1.2;
    letter-spacing: 0.3px;
    color: #a2a2a2;
  }

  &:active,
  &:focus {
    outline: 0;
  }
`;

const BackButtonIconImage = styled.img`
  width: 24px;
  height: 24px;
`;

const LogoImage = styled.img`
  width: 27.68px;
  height: 28px;
  user-select: none;
  -webkit-user-drag: none;
  cursor: pointer;
`;

const Title = styled.span`
  font-weight: bold;
  font-size: 16px;
  line-height: 19px;
  color: black;
  letter-spacing: 0.3px;
`;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
`;

const IconImage = styled.img`
  width: 24px;
  height: 24px;
  user-select: none;
  -webkit-user-drag: none;
`;

const ProfileImage = styled.img`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  margin-left: 32px;
  user-select: none;
  -webkit-user-drag: none;
  cursor: pointer;
`;
