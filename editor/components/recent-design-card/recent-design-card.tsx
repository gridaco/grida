import React from "react";
import { RecentDesign } from "../../store";
import moment from "moment";
import styled from "@emotion/styled";
import { HomeSceneCard } from "components/home/card";

export type OnCardClickCallback = (id: string, data?: RecentDesign) => void;

/**
 * create recent design card component
 **/
export function RecentDesignCard(props: {
  data: RecentDesign;
  onclick?: OnCardClickCallback;
}) {
  const { name, id, provider, previewUrl, lastUpdatedAt } = props.data;
  const onclick = () => {
    props.onclick?.(id, props.data);
  };
  return (
    <HomeSceneCard
      onClick={onclick}
      label={name}
      thumbnail={previewUrl}
      description={_str_lastUpdatedAt(lastUpdatedAt)}
    />
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
  return moment(lastUpdatedAt).format("MM/dd/yyyy");
}

function _str_alt(name: string) {
  return `${name} Design`;
}
