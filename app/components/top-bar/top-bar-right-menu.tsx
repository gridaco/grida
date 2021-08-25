import React from "react";
import styled from "@emotion/styled";
import { TopBarMultiplayerSegment } from "./top-bar-multiplayer-segment";
import { TopBarShareButton } from "./top-bar-share-button";
import { TopBarMoreButton } from "./top-bar-more-button";
import { UserProfile } from "../../../packages/type";

interface Props {
  isSimple?: boolean;
  profile?: UserProfile;
  contorlModal?: () => void;
}

export function TopBarRightMenu(props: Props) {
  return (
    <_Root>
      <TopBarMultiplayerSegment
        isSimple={props.isSimple}
        players={props.profile}
      />

      {!props.isSimple && (
        <>
          <MarginRight size={24} />
          <TopBarShareButton contorlModal={props.contorlModal} />
          <MarginRight size={19} />

          <TopBarMoreButton />
        </>
      )}
    </_Root>
  );
}

const _Root = styled.div`
  padding: 16px;
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
`;

const MarginRight = styled.div<{ size: number }>`
  margin-right: ${(props) => `${props.size}px`};
`;
