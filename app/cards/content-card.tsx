import React from "react";
import styled from "@emotion/styled";
import { nanoid } from "nanoid";

export function ContentCard(props: {
  id?: string;
  title: string;
  description: string;
}) {
  let key = props.id ?? nanoid();
  return <Root key={key}>{props.title}</Root>;
}

const Root = styled.div``;
