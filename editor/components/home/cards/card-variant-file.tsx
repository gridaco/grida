import React from "react";
import { BaseHomeSceneCard } from "./base-home-scene-card";

export function FileCard({
  label,
  thumbnail,
}: {
  label: string;
  thumbnail: string;
}) {
  return <BaseHomeSceneCard label={label} thumbnail={thumbnail} />;
}
