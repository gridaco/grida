import React from "react";
import { nanoid } from "nanoid";

export function ContentCard(props: {
  id?: string;
  title: string;
  description: string;
}) {
  let key = props.id ?? nanoid();
  return <div key={key}>{props.title}</div>;
}
