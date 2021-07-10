import React from "react";
import { RecentDesign } from "../../store";
import moment from "moment";
import styled from "@emotion/styled";

/**
 * create recent design card component
 **/
export function RecentDesignCard(props: { data: RecentDesign }) {
  const { name, id, provider, previewUrl, lastUpdatedAt } = props.data;
  return (
    <Container>
      <PreviewHolder src={_safe_previewurl(previewUrl)} />
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
  return moment(lastUpdatedAt).toLocaleString();
}

const Container = styled.div``;

const PreviewHolder = styled.img`
  height: 100%;
  width: 100%;
  background-size: cover;
  background-position: center center;
`;

const NameText = styled.h6`
  font-size: 14px;
`;

const LastUpdateText = styled.h6``;
