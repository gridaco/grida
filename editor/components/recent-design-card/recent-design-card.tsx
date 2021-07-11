import React from "react";
import { RecentDesign } from "../../store";
import moment from "moment";
import styled from "@emotion/styled";

export type OnCardClickCallback = (id: string, data?: RecentDesign) => void;

/**
 * create recent design card component
 **/
export function RecentDesignCard(props: {
  data: RecentDesign;
  onclick?: OnCardClickCallback;
}) {
  const { name, id, provider, previewUrl, lastUpdatedAt } = props.data;
  const onclick = (e) => {
    props.onclick?.(id, props.data);
  };
  return (
    <Container onClick={onclick}>
      <PreviewImage
        src={_safe_previewurl(previewUrl)}
        alt={`${_str_alt(name)}`}
      />
      <NameText>{name}</NameText>
      <LastUpdateText>{_str_lastUpdatedAt(lastUpdatedAt)}</LastUpdateText>
    </Container>
  );
}

const _defaultpreview =
  "https://s3.amazonaws.com/uifaces/faces/twitter/golovey/128.jpg";
function _safe_previewurl(previewUrl: string): string {
  if (!previewUrl) {
    return _defaultpreview;
  }
  return previewUrl;
}

function _str_lastUpdatedAt(lastUpdatedAt: Date) {
  return moment(lastUpdatedAt).toString();
}

function _str_alt(name: string) {
  return `${name} Design`;
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  max-width: 240px;
  max-height: 360px;

  &:hover {
    cursor: pointer;
  }
`;

const PreviewImage = styled.img`
  height: 120px;
  width: 100%;
  max-width: 100%;
  background-size: cover;
  background-position: center center;
`;

const NameText = styled.h6`
  font-size: 14px;
`;

const LastUpdateText = styled.h6`
  font-size: 11px;
  font-weight: normal;
`;
